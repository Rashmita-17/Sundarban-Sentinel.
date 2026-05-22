# Sundarbans Sentinel 🛰️

Sundarbans Sentinel is a high-fidelity monitoring dashboard designed to protect the world's largest mangrove forest. By leveraging satellite imagery and deep learning, the platform detects coastal erosion, quantifies carbon loss, and assesses village vulnerability to secure the livelihoods of millions.

## 🌟 Key Features

- **Siamese UNET Architecture**: A state-of-the-art deep learning model optimized for change detection. By processing dual-temporal satellite images through a shared encoder, it precisely identifies areas of land loss and water encroachment.
- **2.5m Super-Resolution Imagery**: Integrates high-resolution multi-spectral data (RGB + NIR) to provide granular insights into mangrove health and coastal shifts that standard 10m resolution might miss.
- **Blue Carbon Engine**: Automatically calculates carbon emissions from eroded mangrove areas using localized NDVI data and specialized biomass formulas.
- **MapLibre GL JS Integration**: A fully open-source mapping engine featuring dynamic risk mapping with pulsing GeoJSON overlays to highlight critical erosion zones.
- **Automated Reporting**: Generates comprehensive PDF reports detailing environmental metrics and social impact assessments for stakeholders.

## 🌍 Social Impact

- **Livelihood Protection**: Provides early warning signs of erosion to coastal communities, helping protect traditional fishing grounds and agricultural land.
- **Carbon Credit Securitization**: Accurate quantification of carbon stocks and losses enables the project to facilitate Carbon Credit certification, bringing sustainable funding to conservation efforts.
- **Displacement Prevention**: Identifies high-risk "Village Vulnerability" zones to inform government infrastructure projects and climate adaptation strategies.

## 🛠️ Tech Stack

- **Frontend**: Next.js 14, Tailwind CSS, Framer Motion, MapLibre GL JS.
- **Backend**: FastAPI, PyTorch, stac2cube, NumPy.
- **AI/ML**: Siamese UNET (Change Detection), NDVI-based Carbon Impact Analysis.

## 🚀 Quick Start

1.  **Configure Environment**:
    Place your Google Earth Engine service account JSON key in the `backend/` folder.
    Name it `gee-service-account.json`.

2.  **Install Dependencies**:
    ```bash
    npm install
    cd backend && pip install -r requirements.txt
    ```

3.  **Launch Project**:
    ```bash
    npm run dev
    ```
    - Frontend: `http://localhost:3000`
    - Backend API: `http://localhost:8000`

---
*Developed with ❤️ for the Sundarbans Ecosystem.*
