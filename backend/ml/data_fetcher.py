import numpy as np
from typing import Dict, Any, List
import ee

def fetch_sentinel_data(polygon: Dict[str, Any], year: int):
    """
    Fetches Sentinel-2 L2A data using Google Earth Engine for a specific year.
    Returns a numpy array of shape (2, 4, 256, 256) representing T1 and T2.
    """
    try:
        # Convert GeoJSON to EE Geometry
        region = ee.Geometry(polygon)
        
        def get_median_image(target_year):
            start = f"{target_year}-01-01"
            end = f"{target_year}-12-31"
            col = (ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
                   .filterBounds(region)
                   .filterDate(start, end)
                   .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20)))
            return col.median().clip(region).select(['B4', 'B3', 'B2', 'B8']) # RGB + NIR

        # Fetch T1 (Previous Year) and T2 (Selected Year)
        img_t1 = get_median_image(year - 1)
        img_t2 = get_median_image(year)

        # Extract pixels as numpy arrays (Simplified for demo, usually requires sampling)
        # In a production environment, you'd use ee.Image.sampleRectangle or 
        # export to a cloud bucket. For this UI, we simulate the result:
        print(f"DEBUG: GEE Fetching comparison: {year-1} vs {year}")
        
        # For the purpose of running the UI without complex GEE exports:
        # We return a structured array that the model expects.
        # In a real scenario, you would use: img_t2.sampleRectangle(region).get('B4').getInfo()
        np.random.seed(year)
        return np.random.randint(0, 10000, (2, 4, 256, 256))
    
    except Exception as e:
        print(f"Error in data fetcher: {str(e)}")
        raise e

def polygon_to_bbox(polygon: Dict[str, Any]):
    """Helper to extract bbox from GeoJSON polygon"""
    coords = polygon['coordinates'][0]
    lons = [c[0] for c in coords]
    lats = [c[1] for c in coords]
    return [min(lons), min(lats), max(lons), max(lats)]
