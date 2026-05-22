import numpy as np

def calculate_carbon_impact(erosion_mask, ndvi_data):
    """
    Calculates carbon impact from lost mangrove area.
    
    Args:
        erosion_mask (np.ndarray): Binary mask (1 for eroded land, 0 otherwise)
        ndvi_data (np.ndarray): NDVI values for the region
        
    Returns:
        dict: A dictionary containing hectares_lost and total_carbon_emitted.
    """
    # Sentinel-2 resolution is 10m x 10m = 100 square meters per pixel
    # 1 hectare = 10,000 square meters
    # So 1 pixel = 100 / 10,000 = 0.01 hectares
    pixel_to_hectares = 0.01
    
    # Calculate total area of eroded pixels in hectares
    eroded_pixel_count = np.sum(erosion_mask)
    hectares_lost = float(eroded_pixel_count * pixel_to_hectares)
    
    # Apply Blue Carbon formula: Carbon Stock (tons/ha) = 0.0043 * e^(11.726 * NDVI)
    # We only care about NDVI in the eroded areas
    if hectares_lost > 0:
        eroded_ndvi = ndvi_data[erosion_mask == 1]
        # Calculate carbon stock per hectare for each eroded pixel
        carbon_stocks = 0.0043 * np.exp(11.726 * eroded_ndvi)
        # Average carbon stock across eroded pixels * total hectares
        # (Alternatively: sum(carbon_stock_per_pixel * hectares_per_pixel))
        total_carbon_emitted = float(np.sum(carbon_stocks * pixel_to_hectares))
    else:
        total_carbon_emitted = 0.0
        
    return {
        "hectares_lost": round(hectares_lost, 4),
        "total_carbon_emitted": round(total_carbon_emitted, 4)
    }
