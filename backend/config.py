"""
RAVENS configuration — thresholds, constants, and settings.
"""
import os

# --- Database ---
DATABASE_URL = os.getenv("RAVENS_DB_URL", "sqlite+aiosqlite:///./ravens.db")

# --- LiDAR Pipeline ---
SOR_K_NEIGHBORS = 20
SOR_STD_RATIO = 2.0

RANSAC_DISTANCE_THRESHOLD = 0.15
RANSAC_NUM_ITERATIONS = 1000
RANSAC_SAMPLE_SIZE = 3

DBSCAN_EPS = 0.5
DBSCAN_MIN_SAMPLES = 10

MIN_CLUSTER_POINTS = 15

# --- Waste categories ---
WASTE_CATEGORIES = ["plastic", "metal", "organic", "construction", "liquid", "background"]

# --- Thermal Analysis ---
THERMAL_DT_LOW = 3.0
THERMAL_DT_MEDIUM = 5.0
THERMAL_DT_HIGH = 8.0
THERMAL_MEDIAN_KERNEL = 15

# --- Fusion Weights ---
FUSION_THERMAL_WEIGHT = 0.45
FUSION_OPTICAL_WEIGHT = 0.35
FUSION_LIDAR_WEIGHT = 0.20
FUSION_CONFIRMED_THRESHOLD = 0.7
FUSION_SUSPECTED_THRESHOLD = 0.4

# --- Prediction ---
DIFFUSION_COEFF = 10.0          # m²/s  (lateral dispersion in a river)
PREDICTION_GRID_SIZE = 64
PREDICTION_DX = 50.0            # metres per grid cell
PREDICTION_DT = 60.0            # seconds per timestep
LSTM_HIDDEN_SIZE = 256
LSTM_NUM_LAYERS = 2

# --- ANAR API ---
ANAR_API_URL = os.getenv("ANAR_API_URL", "https://api.anar.ro/discharge")
ANAR_TIMEOUT = 5                # seconds

# --- Map defaults ---
MAP_CENTER_LAT = 46.0
MAP_CENTER_LON = 25.0
MAP_DEFAULT_ZOOM = 7

# --- Server ---
API_HOST = "0.0.0.0"
API_PORT = 8000
