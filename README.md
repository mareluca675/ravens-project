# RAVENS — River AI Vision for Environmental Surveillance

Aquatic pollution monitoring system combining LiDAR 3D point clouds, thermal imagery,
optical imagery, and hydrological data to detect waste, identify illegal dumping,
and predict pollutant trajectories.

## Architecture

```
backend/
  main.py              FastAPI entry point
  config.py            Settings and thresholds
  pipeline/
    lidar_pipeline.py  SOR → RANSAC → DBSCAN → PCA features
    fusion_engine.py   Thermal + optical + LiDAR multi-sensor fusion
    prediction_engine.py  Advection-diffusion PDE + LSTM correction
  models/
    lidar_classifier.py   PyTorch waste classifier (feature + CNN branches)
    thermal_detector.py   Thermal anomaly detector
    optical_classifier.py HSV-based substance classifier
    lstm_predictor.py     LSTM trajectory correction re-export
  api/
    waste.py           POST /api/lidar/process, GET /api/waste/detections
    dumping.py         POST /api/dumping/detect, GET /api/dumping/incidents
    prediction.py      POST /api/prediction/trajectory, GET /api/prediction/trajectories
  database/
    models.py          SQLAlchemy ORM (SQLite)
    crud.py            Async CRUD operations
  utils/
    synthetic_data.py  Synthetic point clouds, thermal scenes, discharge data
    visualizer.py      GeoJSON conversion utilities
frontend/
  src/
    App.jsx            Main app with demo button and tab navigation
    components/
      Map.jsx          Leaflet interactive map with 4 toggle layers
      WastePanel.jsx   Detection table, pie chart, histogram
      DumpingPanel.jsx Incident cards with evidence score bars
      PredictionPanel.jsx  Time slider, dispersion chart
tests/
  test_sor.py          Statistical Outlier Removal tests
  test_ransac.py       RANSAC ground plane tests
  test_dbscan.py       DBSCAN clustering tests
  test_pca_features.py PCA feature extraction tests
  test_advection_diffusion.py  PDE solver tests
  test_lstm.py         LSTM model tests
```

## Algorithms (implemented from scratch)

| Algorithm | File | Complexity |
|-----------|------|------------|
| Statistical Outlier Removal (SOR) | `lidar_pipeline.py` | O(N·k·log N) |
| RANSAC plane fitting | `lidar_pipeline.py` | O(iterations·N) |
| DBSCAN clustering | `lidar_pipeline.py` | O(N·log N) |
| PCA feature extraction | `lidar_pipeline.py` | O(N) per cluster |
| Advection-diffusion PDE | `prediction_engine.py` | O(H·W) per step |
| LSTM trajectory correction | `prediction_engine.py` | O(T·H²) |

## Prerequisites

- **Python 3.10+** — backend runtime
- **Node.js 18+** and **npm** — frontend build tooling
- **pip** — Python package manager

## Getting Started

### 1. Clone the repository

```bash
git clone https://github.com/mareluca675/ravens-project.git
cd ravens-project
```

### 2. Install backend dependencies

```bash
pip install -r requirements.txt
```

This installs FastAPI, PyTorch, NumPy, SciPy, and all other Python packages.

### 3. Install frontend dependencies

```bash
cd frontend
npm install
cd ..
```

### 4. Start the application

You need to run **two servers** — the Python backend and the React frontend. Both must be running at the same time. Open a **terminal** (Command Prompt / PowerShell on Windows, Terminal on macOS/Linux) and navigate to the project folder.

> **Important:** Do NOT double-click `run.sh` — it will open in a text editor instead of running. All commands below must be typed into a terminal.

**Option A — Start each server manually (recommended):**

Open **two separate terminal windows**, both starting in the `ravens-project` folder.

Terminal 1 — Start the backend:
```bash
python -m uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```
Wait until you see `Uvicorn running on http://0.0.0.0:8000` — the backend is now ready.

Terminal 2 — Start the frontend:
```bash
cd frontend
npm start
```
Wait until you see `Compiled successfully!` — a browser tab should open automatically.

**Option B — Start both at once (macOS/Linux only):**

```bash
chmod +x run.sh
./run.sh
```

Press `Ctrl+C` to stop both servers.

### 5. Open the application

Once both servers are running, open your browser and go to:

> **http://localhost:3000**

If the page shows a blank screen or connection error, make sure the backend (Terminal 1) is still running — the frontend needs it to load data.

You should see the RAVENS dashboard with a dark-themed UI, a tab bar (Map View, Waste, Dumping, Prediction), and a stats bar at the top.

### 6. Generate demo data

The application runs fully offline using built-in synthetic data generators — no real sensors or external APIs are required.

Click the **"Generate Demo Data"** button in the top-right corner of the UI. This calls the backend to:
- Process a synthetic LiDAR point cloud (waste detection + classification)
- Run multi-sensor fusion (thermal + optical + LiDAR dumping analysis)
- Simulate a pollutant trajectory prediction (advection-diffusion model)

After a few seconds the map will populate with detection markers and all dashboard panels will show data.

The backend API is also available directly at **http://localhost:8000**. You can explore it interactively at **http://localhost:8000/docs** (Swagger UI).

## API Examples

```bash
# Generate synthetic LiDAR waste detections
curl -X POST "http://localhost:8000/api/lidar/process?synthetic=true"

# Run dumping detection with synthetic multi-sensor data
curl -X POST "http://localhost:8000/api/dumping/detect?synthetic=true"

# Predict trajectory from a point on Someș river
curl -X POST "http://localhost:8000/api/prediction/trajectory?lat=46.77&lon=23.59"

# Get combined map layers (GeoJSON)
curl "http://localhost:8000/api/map/layers"

# Get statistics
curl "http://localhost:8000/api/stats/summary"
```

## Running Tests

```bash
pytest tests/ -v
```

## Tech Stack

- **Backend:** Python, FastAPI, SQLAlchemy (async SQLite), PyTorch, NumPy, SciPy
- **Frontend:** React 18, Leaflet, Recharts, Axios
- **Data:** Synthetic generators for point clouds, thermal scenes, river discharge
