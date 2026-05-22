import numpy as np
from typing import Dict, Any, List
import ee

def polygon_to_bbox(polygon: Dict[str, Any]):
    coords = polygon['coordinates'][0]
    lons = [c[0] for c in coords]
    lats = [c[1] for c in coords]
    return [min(lons), min(lats), max(lons), max(lats)]


def _choose_scale_m(polygon: Dict[str, Any], target_px: int = 128, min_scale_m: float = 30.0, max_scale_m: float = 500.0) -> float:
    min_lon, min_lat, max_lon, max_lat = polygon_to_bbox(polygon)
    lat_mid = (min_lat + max_lat) / 2.0

    meters_per_deg_lat = 110540.0
    meters_per_deg_lon = 111320.0 * float(np.cos(np.deg2rad(lat_mid)))

    width_m = max(1.0, (max_lon - min_lon) * meters_per_deg_lon)
    height_m = max(1.0, (max_lat - min_lat) * meters_per_deg_lat)

    scale = max(width_m / target_px, height_m / target_px, min_scale_m)
    return float(min(max_scale_m, scale))


def _as_2d_array(value: Any) -> np.ndarray | None:
    if value is None:
        return None
    arr = np.array(value)
    if arr.ndim != 2:
        return None
    return arr


def _resize_nearest(arr: np.ndarray, target_h: int = 256, target_w: int = 256) -> np.ndarray:
    h, w = arr.shape
    if h == target_h and w == target_w:
        return arr

    y_idx = np.linspace(0, max(h - 1, 0), target_h).astype(np.int32)
    x_idx = np.linspace(0, max(w - 1, 0), target_w).astype(np.int32)
    return arr[np.ix_(y_idx, x_idx)]


def _sample_cube(image: ee.Image, region: ee.Geometry, bands: List[str]) -> np.ndarray:
    sampled = image.sampleRectangle(region=region, defaultValue=0).getInfo()
    props = (sampled or {}).get("properties", {}) or {}

    channels: List[np.ndarray] = []
    for band in bands:
        band_arr = _as_2d_array(props.get(band))
        if band_arr is None:
            band_arr = np.zeros((256, 256), dtype=np.float32)
        band_arr = np.nan_to_num(band_arr.astype(np.float32), nan=0.0, posinf=0.0, neginf=0.0)
        band_arr = _resize_nearest(band_arr, 256, 256)
        channels.append(band_arr)

    return np.stack(channels, axis=0)

def fetch_sentinel_data(polygon: Dict[str, Any], year: int):
    """
    Fetches Sentinel-2 L2A data using Google Earth Engine for a specific year.
    Returns a numpy array of shape (2, 4, 256, 256) representing T1 and T2.
    """
    try:
        # Convert GeoJSON to EE Geometry
        region = ee.Geometry(polygon)
        sample_region = region.bounds()
        scale_m = _choose_scale_m(polygon)
        
        def get_median_image(target_year):
            start = f"{target_year}-01-01"
            end = f"{target_year}-12-31"
            col = (ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
                   .filterBounds(region)
                   .filterDate(start, end)
                   .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 20)))
            return col.median().clip(region).select(['B4', 'B3', 'B2', 'B8']).unmask(0) # RGB + NIR

        # Fetch T1 (Previous Year) and T2 (Selected Year)
        img_t1 = get_median_image(year - 1)
        img_t2 = get_median_image(year)

        print(f"DEBUG: GEE sampleRectangle comparison: {year-1} vs {year} (scale≈{int(scale_m)}m)")

        bands = ['B4', 'B3', 'B2', 'B8']
        proj = img_t2.select('B4').projection().atScale(scale_m)
        img_t1 = img_t1.resample('bilinear').reproject(proj)
        img_t2 = img_t2.resample('bilinear').reproject(proj)

        t1 = _sample_cube(img_t1, sample_region, bands)
        t2 = _sample_cube(img_t2, sample_region, bands)
        return np.stack([t1, t2], axis=0), float(scale_m)
    
    except Exception as e:
        print(f"Error in data fetcher: {str(e)}")
        raise e
