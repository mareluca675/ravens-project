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

## Setup

### Backend

```bash
pip install -r requirements.txt
uvicorn backend.main:app --host 0.0.0.0 --port 8000 --reload
```

### Frontend

```bash
cd frontend
npm install
npm start    # runs on :3000
```

### Both (convenience)

```bash
./run.sh
```

## Demo

The application runs fully offline using synthetic data. Click **Generate Demo Data**
in the UI, or call the API directly:

```bash
# Generate synthetic LiDAR waste detections
curl -X POST "http://localhost:8000/api/lidar/process?synthetic=true"

# Run dumping detection with synthetic multi-sensor data
curl -X POST "http://localhost:8000/api/dumping/detect?synthetic=true"

# Predict trajectory from a point on Someș river
curl -X POST "http://localhost:8000/api/prediction/trajectory?lat=46.77&lon=23.59"

# Get combined map layers
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
