import torch
import numpy as np
from models.model import SiameseUNet
import os

def load_model(checkpoint_path=None, device='cpu'):
    """
    Initializes the Siamese UNET and loads weights if provided.
    """
    model = SiameseUNet(n_channels=4, n_classes=1)
    if checkpoint_path and os.path.exists(checkpoint_path):
        model.load_state_dict(torch.load(checkpoint_path, map_location=device))
    model.to(device)
    model.eval()
    return model

def preprocess_cube(cube_data):
    """
    Converts stac2cube output to torch tensors.
    Explicitly extracts T1 (previous year/time) and T2 (current year/time) 
    for comparison in the Siamese UNET.
    Format expected: (Time, Channels, Height, Width)
    """
    if not isinstance(cube_data, np.ndarray):
        cube_data = np.array(cube_data)
        
    # Ensure we have at least 2 time steps for comparison
    if cube_data.shape[0] < 2:
        print("Warning: Data cube has only one time step. Using dummy comparison.")
        t2 = cube_data[0]
        t1 = cube_data[0] # Fallback to same image if comparison not possible
    else:
        # T2 is the selected year imagery
        # T1 is the previous year/base imagery for comparison
        t2 = cube_data[-1] 
        t1 = cube_data[0] 
    
    # Normalize (Sentinel-2 L2A range 0-10000)
    t1 = t1.astype(np.float32) / 10000.0
    t2 = t2.astype(np.float32) / 10000.0
    
    t1_tensor = torch.from_numpy(t1).unsqueeze(0)
    t2_tensor = torch.from_numpy(t2).unsqueeze(0)
    
    return t1_tensor, t2_tensor

def predict_change(model, t1_tensor, t2_tensor, device='cpu'):
    """
    Runs inference to detect change (erosion).
    """
    t1_tensor = t1_tensor.to(device)
    t2_tensor = t2_tensor.to(device)
    
    with torch.no_grad():
        output = model(t1_tensor, t2_tensor)
        # Convert to binary mask (thresholding at 0.5)
        mask = (output > 0.5).float()
        
    return mask.squeeze().cpu().numpy()

def run_pipeline(cube_data, checkpoint_path=None):
    """
    Main entry point for processing stac2cube data.
    """
    device = torch.device('cuda' if torch.cuda.is_available() else 'cpu')
    print(f"Using device: {device}")
    
    # 1. Initialize Model
    model = load_model(checkpoint_path, device)
    
    # 2. Preprocess Data
    t1, t2 = preprocess_cube(cube_data)
    
    # 3. Predict
    change_mask = predict_change(model, t1, t2, device)
    
    print("Change detection completed.")
    return change_mask

if __name__ == "__main__":
    # Example usage with dummy data
    dummy_cube = np.random.randint(0, 10000, (2, 4, 256, 256))
    mask = run_pipeline(dummy_cube)
    print(f"Mask shape: {mask.shape}")
    print(f"Detected erosion pixels: {np.sum(mask)}")
