import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Depends
from pydantic import BaseModel
from typing import Dict, Any, List, Optional
from dotenv import load_dotenv
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response, StreamingResponse
import io
from fpdf import FPDF
import ee
import json
import hashlib
import math

from datetime import datetime
import numpy as np
from sqlalchemy.orm import Session
from starlette.concurrency import run_in_threadpool

from db import engine, get_db
from db_models import Base, AnalysisResult

ALGO_VERSION = "gee_fast_v3_watergain_ndviT1"


def _polygon_to_bbox(polygon: Dict[str, Any]):
    coords = polygon["coordinates"][0]
    lons = [c[0] for c in coords]
    lats = [c[1] for c in coords]
    return [min(lons), min(lats), max(lons), max(lats)]


def _choose_scale_m(
    polygon: Dict[str, Any],
    target_px: int = 192,
    min_scale_m: float = 60.0,
    max_scale_m: float = 2000.0,
) -> float:
    min_lon, min_lat, max_lon, max_lat = _polygon_to_bbox(polygon)
    lat_mid = (min_lat + max_lat) / 2.0

    meters_per_deg_lat = 110540.0
    meters_per_deg_lon = 111320.0 * math.cos(math.radians(lat_mid))

    width_m = max(1.0, (max_lon - min_lon) * meters_per_deg_lon)
    height_m = max(1.0, (max_lat - min_lat) * meters_per_deg_lat)

    scale = max(width_m / target_px, height_m / target_px, min_scale_m)
    return float(min(max_scale_m, scale))


def _get_median_s2(region: ee.Geometry, year: int) -> ee.Image:
    start_date = f"{year}-01-01"
    end_date = f"{year}-12-31"

    col = (
        ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterBounds(region)
        .filterDate(start_date, end_date)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 20))
    )

    count = col.size()
    col = ee.ImageCollection(ee.Algorithms.If(count.gt(0), col, ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED").filterBounds(region).filterDate(f"{year-1}-01-01", f"{year+1}-12-31").filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 30))))
    return col.median().clip(region).unmask(0)


def gee_fast_metrics(polygon: Dict[str, Any], year: int) -> Dict[str, float]:
    region = ee.Geometry(polygon)
    scale_m = _choose_scale_m(polygon)
    simplified = region.simplify(scale_m)

    img_t1 = _get_median_s2(region, year - 1)
    img_t2 = _get_median_s2(region, year)

    ndvi_t1 = img_t1.normalizedDifference(["B8", "B4"]).rename("NDVI_T1")
    ndvi_t2 = img_t2.normalizedDifference(["B8", "B4"]).rename("NDVI_T2")
    ndwi_t1 = img_t1.normalizedDifference(["B3", "B8"]).rename("NDWI_T1")
    ndwi_t2 = img_t2.normalizedDifference(["B3", "B8"]).rename("NDWI_T2")
    water_t1 = ndwi_t1.gt(0.1)
    water_t2 = ndwi_t2.gt(0.1)
    water_gain = water_t2.And(water_t1.Not())

    ndvi_drop = ndvi_t1.subtract(ndvi_t2)
    veg_loss = ndvi_drop.gt(0.25).And(ndvi_t1.gt(0.35)).And(ndvi_t2.lt(0.15))

    mask = water_gain.Or(veg_loss).selfMask()

    pixel_area_ha = ee.Image.pixelArea().divide(10000.0)
    area_ha_img = pixel_area_ha.updateMask(mask).rename("area_ha")

    carbon_stock = ee.Image.constant(0.0043).multiply(ndvi_t1.multiply(11.726).exp()).rename("carbon_stock")
    carbon_total_img = carbon_stock.multiply(pixel_area_ha).updateMask(mask).rename("carbon_total")

    eroded_pixels_img = ee.Image(1).updateMask(mask).rename("eroded_pixels")

    sums = (
        area_ha_img.addBands(carbon_total_img)
        .addBands(eroded_pixels_img)
        .reduceRegion(
            reducer=ee.Reducer.sum(),
            geometry=simplified,
            scale=scale_m,
            maxPixels=1e13,
            bestEffort=True,
            tileScale=4,
        )
        .getInfo()
        or {}
    )

    hectares_lost = float(sums.get("area_ha", 0.0) or 0.0)
    total_carbon_emitted = float(sums.get("carbon_total", 0.0) or 0.0)
    eroded_pixels = float(sums.get("eroded_pixels", 0.0) or 0.0)

    return {
        "scale_m": float(scale_m),
        "eroded_pixels": float(eroded_pixels),
        "hectares_lost": float(round(hectares_lost, 4)),
        "total_carbon_emitted": float(round(total_carbon_emitted, 4)),
    }

# Load environment variables
load_dotenv()

# Google Earth Engine Authentication
GEE_JSON_PATH = os.path.join(os.path.dirname(__file__), "gee-service-account.json")

# Global GEE initialization status
GEE_INITIALIZED = False

def initialize_gee():
    global GEE_INITIALIZED
    if not os.path.exists(GEE_JSON_PATH):
        print(f"CRITICAL: GEE Service Account file missing at {GEE_JSON_PATH}")
        GEE_INITIALIZED = False
        return False
    
    try:
        with open(GEE_JSON_PATH) as f:
            account_info = json.load(f)
            client_email = account_info.get("client_email")
            
        if not client_email:
            print("CRITICAL: Invalid Service Account JSON - missing client_email")
            GEE_INITIALIZED = False
            return False
            
        credentials = ee.ServiceAccountCredentials(client_email, GEE_JSON_PATH)
        ee.Initialize(credentials)
        print("Google Earth Engine initialized successfully.")
        GEE_INITIALIZED = True
        return True
    except Exception as e:
        print(f"CRITICAL: GEE Initialization Failed: {str(e)}")
        if "permission" in str(e).lower():
            print("ERROR: Service Account may lack necessary Earth Engine permissions.")
        GEE_INITIALIZED = False
        return False

@asynccontextmanager
async def lifespan(app: FastAPI):
    # Initialize GEE on startup
    initialize_gee()
    Base.metadata.create_all(bind=engine)
    yield
    # Shutdown logic can go here

app = FastAPI(title="Sundarbans Sentinel API", lifespan=lifespan)

# Add CORS middleware
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["Content-Disposition"],
)

class AnalysisRequest(BaseModel):
    geojson: Dict[str, Any]
    date_range: List[str]  # [start_date, end_date]

class ReportRequest(BaseModel):
    hectares_lost: float
    carbon_tons: float
    year: int
    coordinates: str

@app.get("/")
async def root():
    return {"message": "Welcome to Sundarbans Sentinel API"}

@app.post("/api/report")
async def generate_report(request: ReportRequest):
    """
    Generates a professional PDF environmental impact report.
    """
    try:
        pdf = FPDF()
        pdf.add_page()
        
        # Header
        pdf.set_font("Arial", "B", 16)
        pdf.set_text_color(16, 185, 129) # Emerald-500
        pdf.cell(0, 10, "Sundarbans Sentinel: Environmental Impact Report", ln=True, align="C")
        pdf.ln(10)
        
        # Metadata
        pdf.set_font("Arial", "", 10)
        pdf.set_text_color(100, 100, 100)
        pdf.cell(0, 5, f"Analysis Year: {request.year}", ln=True)
        pdf.cell(0, 5, f"Location: {request.coordinates}", ln=True)
        pdf.cell(0, 5, f"Report Generated: {datetime.now().strftime('%Y-%m-%d')}", ln=True)
        pdf.ln(10)
        
        # Impact Summary Table
        pdf.set_font("Arial", "B", 14)
        pdf.set_text_color(0, 0, 0)
        pdf.cell(0, 10, "Impact Summary", ln=True)
        
        pdf.set_font("Arial", "B", 12)
        pdf.cell(95, 10, "Metric", border=1)
        pdf.cell(95, 10, "Value", border=1, ln=True)
        
        pdf.set_font("Arial", "", 12)
        pdf.cell(95, 10, "Total Mangrove Loss", border=1)
        pdf.cell(95, 10, f"{request.hectares_lost} Hectares", border=1, ln=True)
        pdf.cell(95, 10, "Total Carbon Emitted", border=1)
        pdf.cell(95, 10, f"{request.carbon_tons} Tons", border=1, ln=True)
        pdf.ln(15)
        
        # Social Impact Assessment
        pdf.set_font("Arial", "B", 14)
        pdf.cell(0, 10, "Social Impact Assessment", ln=True)
        pdf.set_font("Arial", "", 11)
        impact_text = (
            "The observed mangrove loss directly threatens local livelihoods. "
            "Mangroves serve as a natural buffer against cyclones and storm surges. "
            "Their degradation increases the vulnerability of coastal villages, "
            "potentially leading to forced displacement and loss of traditional fishing grounds."
        )
        pdf.multi_cell(0, 7, impact_text)
        
        # Footer
        pdf.set_y(-30)
        pdf.set_font("Arial", "I", 8)
        pdf.set_text_color(150, 150, 150)
        pdf.cell(0, 10, "This report is generated by Sundarbans Sentinel Monitoring System.", align="C")

        # Output to buffer
        pdf_output = io.BytesIO()
        pdf_str = pdf.output()
        if isinstance(pdf_str, bytearray):
            pdf_output.write(pdf_str)
        else:
            pdf_output.write(pdf_str.encode('latin1') if isinstance(pdf_str, str) else pdf_str)
            
        pdf_output.seek(0)
        
        headers = {
            'Content-Disposition': f'attachment; filename="Sundarbans_Impact_Report_{request.year}.pdf"'
        }
        
        return StreamingResponse(pdf_output, media_type="application/pdf", headers=headers)
        
    except Exception as e:
        print(f"Report generation error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"Failed to generate report: {str(e)}")

@app.get("/api/tiles")
async def get_tiles(year: int, mode: str = "natural"):
    """
    Returns a dynamic Google Earth Engine MapID URL for satellite tiles.
    Accepts year and mode (natural/ndvi) as query parameters.
    """
    if not GEE_INITIALIZED:
        raise HTTPException(status_code=503, detail="Google Earth Engine not initialized. Check server logs.")
    
    print(f"DEBUG: Backend received year request for: {year}, mode: {mode}")
    try:
        # Sundarbans bounding box (specific and compact to avoid timeouts)
        region = ee.Geometry.Rectangle([88.5, 21.5, 89.2, 22.2])
        
        start_date = f"{year}-01-01"
        end_date = f"{year}-12-31"
        
        # Filter Sentinel-2 L2A collection using the dynamic year
        collection = (ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
                      .filterBounds(region)
                      .filterDate(start_date, end_date)
                      .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20)))
        
        # Check if collection is empty
        count = collection.size().getInfo()
        print(f"DEBUG: Found {count} images for year {year}")
        
        if count == 0:
            # Fallback to a wider date range if no images found in the specific year
            print(f"WARNING: No images found for {year}, expanding search...")
            collection = (ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
                          .filterBounds(region)
                          .filterDate(f"{year-1}-01-01", f"{year+1}-12-31")
                          .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30)))

        # Create cloud-free composite using median reducer
        image = collection.median().clip(region)
        
        if mode == "ndvi":
            ndvi = image.normalizedDifference(['B8', 'B4']).rename('NDVI')
            vis_params = {
                'min': 0,
                'max': 0.8,
                'palette': ['#FFFFFF', '#CE7E45', '#DF923D', '#F1B555', '#FCD163', '#99B718', '#74A901', '#66A000', '#529400', '#3E8601', '#207401', '#056201', '#004C00', '#023B01', '#012E01', '#011D01', '#011301']
            }
            map_id_dict = ndvi.getMapId(vis_params)
        else:
            # Natural Color (B4, B3, B2)
            vis_params = {
                'bands': ['B4', 'B3', 'B2'],
                'min': 0,
                'max': 3000,
                'gamma': 1.4
            }
            map_id_dict = image.getMapId(vis_params)
            
        return {"url": map_id_dict['tile_fetcher'].url_format}
        
    except Exception as e:
        print(f"GEE Tile Generation Error: {str(e)}")
        raise HTTPException(status_code=500, detail=f"GEE Tile Error: {str(e)}")

@app.get("/api/stats")
async def get_stats(year: int, db: Session = Depends(get_db)):
    """
    Returns annual summary statistics for the selected year.
    """
    rows = db.query(AnalysisResult).filter(AnalysisResult.year == year).all()
    if not rows:
        return {"year": year, "analyses": 0, "hectares_lost": 0.0, "total_carbon_emitted": 0.0}

    return {
        "year": year,
        "analyses": len(rows),
        "hectares_lost": float(sum(r.hectares_lost for r in rows)),
        "total_carbon_emitted": float(sum(r.total_carbon_emitted for r in rows)),
    }

@app.post("/api/analyze")
async def analyze_area(request: AnalysisRequest, db: Session = Depends(get_db)):
    if not GEE_INITIALIZED:
        raise HTTPException(status_code=503, detail="Google Earth Engine not initialized. Check server logs.")
        
    if not request.geojson or len(request.date_range) != 2:
        raise HTTPException(status_code=400, detail="Invalid GeoJSON or date range")
    
    # Extract year from date_range for dynamic filtering
    year = int(request.date_range[0].split("-")[0])
    print(f"Analyzing area for year: {year}")

    geojson_str = json.dumps(request.geojson, sort_keys=True, separators=(",", ":"))
    polygon_hash = hashlib.sha256(f"{ALGO_VERSION}|{geojson_str}".encode("utf-8")).hexdigest()

    cached = (
        db.query(AnalysisResult)
        .filter(AnalysisResult.year == year, AnalysisResult.polygon_hash == polygon_hash)
        .first()
    )
    if cached:
        return {
            "status": "success",
            "message": f"Analysis loaded from database for year {year}",
            "analysis_results": {
                "eroded_pixels": float(cached.eroded_pixels),
                "hectares_lost": float(cached.hectares_lost),
                "total_carbon_emitted": float(cached.total_carbon_emitted),
                "mask_shape": [int(cached.mask_h), int(cached.mask_w)],
                "scale_m": 0.0,
            },
        }
    
    try:
        metrics = await run_in_threadpool(gee_fast_metrics, request.geojson, year)
        eroded_pixels = float(metrics["eroded_pixels"])
        record = AnalysisResult(
            polygon_hash=polygon_hash,
            year=year,
            geojson=geojson_str,
            eroded_pixels=eroded_pixels,
            hectares_lost=float(metrics["hectares_lost"]),
            total_carbon_emitted=float(metrics["total_carbon_emitted"]),
            mask_h=0,
            mask_w=0,
        )
        db.add(record)
        db.commit()

        return {
            "status": "success", 
            "message": f"Analysis completed for year {year}",
            "analysis_results": {
                "eroded_pixels": eroded_pixels,
                "hectares_lost": float(metrics["hectares_lost"]),
                "total_carbon_emitted": float(metrics["total_carbon_emitted"]),
                "mask_shape": [0, 0],
                "scale_m": float(metrics["scale_m"]),
            }
        }
    except Exception as e:
        print(f"Error during analysis: {str(e)}")
        raise HTTPException(status_code=500, detail=str(e))

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)





# Use a relative path so it works on your laptop even after a Git pull
current_dir = os.path.dirname(os.path.abspath(__file__))
json_path = os.path.join(current_dir, "gee-service-account.json") 

try:
    # Ensure the file actually exists where you think it is
    if not os.path.exists(json_path):
        print(f"CRITICAL ERROR: Key file not found at {json_path}")
    else:
        credentials = ee.ServiceAccountCredentials(
            "sentinel@gen-lang-client-0483691239.iam.gserviceaccount.com", 
            json_path
        )
        ee.Initialize(credentials)
        print("✓ GEE Initialization Successful")
except Exception as e:
    print(f"GEE Initialization Failed: {e}")
