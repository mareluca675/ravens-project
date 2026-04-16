"""
RAVENS — Pollutant Trajectory Prediction Engine.

Combines a physics-based advection-diffusion PDE solver with an optional
LSTM correction layer to predict pollutant dispersion in a river system.

Mathematical background
-----------------------
The 2D advection-diffusion equation is:

    ∂C/∂t + u·∂C/∂x + v·∂C/∂y = D·(∂²C/∂x² + ∂²C/∂y²)

Discretised with:
  - Advection:  first-order upwind scheme (stable for any Courant number < 1)
  - Diffusion:  central finite differences
  - Time:       explicit Euler integration

The LSTM learns residual corrections from synthetic historical incidents so
that the combined model is more accurate than physics alone.

Dependencies: numpy, torch, logging, requests.
"""

import logging
import json
import math

import numpy as np
import torch
import torch.nn as nn
import requests

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# 1. Advection-Diffusion PDE solver
# ---------------------------------------------------------------------------

def advection_diffusion_step(concentration, velocity_field, diffusion_coeff,
                             dt=60.0, dx=50.0):
    """Advance the concentration field by one explicit-Euler time step.

    Solves:
        ∂C/∂t = -u·∂C/∂x - v·∂C/∂y + D·∇²C

    Advection — first-order upwind scheme
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
    Split velocity into positive and negative parts:
        u⁺ = max(u, 0),  u⁻ = min(u, 0)

    Backward difference for u⁺, forward difference for u⁻:
        (u·∂C/∂x)_ij ≈ u⁺·(C_ij − C_{i-1,j})/dx + u⁻·(C_{i+1,j} − C_ij)/dx

    Diffusion — central differences
    ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~
        ∇²C ≈ (C_{i+1,j} + C_{i-1,j} + C_{i,j+1} + C_{i,j-1} − 4C_ij) / dx²

    Parameters
    ----------
    concentration : np.ndarray, shape (H, W)
        Current scalar concentration field.
    velocity_field : np.ndarray, shape (H, W, 2)
        Per-cell velocity vectors [vx, vy] (m/s).
    diffusion_coeff : float
        Isotropic diffusion coefficient D (m²/s).
    dt : float
        Time step (seconds).
    dx : float
        Spatial step (metres).

    Returns
    -------
    np.ndarray, shape (H, W)
        Updated concentration after one time step.

    Complexity
    ----------
    O(H·W) per time step — fully vectorised.
    """
    C = concentration.astype(np.float64)
    u = velocity_field[:, :, 0]  # x-component
    v = velocity_field[:, :, 1]  # y-component

    # --- Advection (upwind) ---
    # Positive / negative velocity splits
    u_pos = np.maximum(u, 0.0)
    u_neg = np.minimum(u, 0.0)
    v_pos = np.maximum(v, 0.0)
    v_neg = np.minimum(v, 0.0)

    # Backward difference: C[i,j] - C[i-1,j]  (shift right, pad left with 0)
    dC_dx_back = C - np.pad(C, ((1, 0), (0, 0)), mode='constant')[:-1, :]
    # Forward difference: C[i+1,j] - C[i,j]
    dC_dx_fwd = np.pad(C, ((0, 1), (0, 0)), mode='constant')[1:, :] - C

    dC_dy_back = C - np.pad(C, ((0, 0), (1, 0)), mode='constant')[:, :-1]
    dC_dy_fwd = np.pad(C, ((0, 0), (0, 1)), mode='constant')[:, 1:] - C

    # Upwind advection term
    advection_x = u_pos * dC_dx_back / dx + u_neg * dC_dx_fwd / dx
    advection_y = v_pos * dC_dy_back / dx + v_neg * dC_dy_fwd / dx

    # --- Diffusion (central differences) ---
    C_pad = np.pad(C, 1, mode='constant')  # zero boundary (Dirichlet)
    laplacian = (
        C_pad[2:, 1:-1] + C_pad[:-2, 1:-1] +   # i+1, i-1
        C_pad[1:-1, 2:] + C_pad[1:-1, :-2] -    # j+1, j-1
        4.0 * C                                   # centre
    ) / (dx * dx)

    # --- Explicit Euler update ---
    C_new = C + dt * (-advection_x - advection_y + diffusion_coeff * laplacian)

    # Enforce non-negative concentration
    np.clip(C_new, 0.0, None, out=C_new)

    return C_new


# ---------------------------------------------------------------------------
# 2. Synthetic velocity field generator
# ---------------------------------------------------------------------------

def generate_velocity_field(grid_size, base_velocity=0.8, direction_deg=180):
    """Create a synthetic river velocity field.

    The field approximates a river channel flowing in the given direction
    with a parabolic cross-section profile (fastest in the centre, zero
    at the banks) and small turbulent perturbations.

    Parameters
    ----------
    grid_size : int
        Spatial grid dimension (square grid).
    base_velocity : float
        Peak flow velocity (m/s) at the river centre.
    direction_deg : float
        Main flow direction in compass degrees (0=N, 90=E, 180=S, 270=W).

    Returns
    -------
    np.ndarray, shape (grid_size, grid_size, 2)
        Velocity vectors [vx, vy] per cell.
    """
    rng = np.random.default_rng(42)

    # Convert direction to vector components (math convention: y-up)
    angle_rad = math.radians(direction_deg)
    dir_x = math.sin(angle_rad)
    dir_y = -math.cos(angle_rad)   # negative because row index increases downward

    # Parabolic cross-section profile: 1 at centre column, 0 at edges
    centre = grid_size / 2.0
    cols = np.arange(grid_size)
    profile = 1.0 - ((cols - centre) / centre) ** 2   # parabola [0..1..0]
    profile = np.clip(profile, 0.0, 1.0)

    # Broadcast to 2-D grid (profile varies across columns, constant across rows)
    speed_2d = base_velocity * profile[np.newaxis, :]   # (1, W) → broadcastable to (H, W)

    # Add small turbulent noise (±5 % of base velocity)
    noise = rng.normal(0, 0.05 * base_velocity, (grid_size, grid_size))

    vx = (speed_2d + noise) * dir_x
    vy = (speed_2d + noise) * dir_y

    # Reduce velocity near top/bottom edges (bank friction)
    edge_rows = int(grid_size * 0.1)
    for i in range(edge_rows):
        factor = i / edge_rows
        vx[i, :] *= factor
        vy[i, :] *= factor
        vx[-(i + 1), :] *= factor
        vy[-(i + 1), :] *= factor

    field = np.stack([vx, vy], axis=-1)
    return field


# ---------------------------------------------------------------------------
# 3. LSTM Trajectory Correction Model
# ---------------------------------------------------------------------------

class TrajectoryLSTM(nn.Module):
    """LSTM model for correcting advection-diffusion predictions.

    The LSTM learns systematic biases in the physics model for specific
    river segments (accumulation zones, meanders, seasonal patterns).

    Architecture
    ------------
    1. Encoder: Linear(grid_size², compressed_size)
    2. LSTM:    input_size = compressed_size + 4 auxiliary features
                hidden_size = 256, num_layers = 2, dropout = 0.2
    3. Decoder: Linear(hidden_size, grid_size²)  → correction field

    Auxiliary features per time step:
        velocity_magnitude, river_discharge, water_level, day_of_year

    Training target: residual = observed − physics_predicted
    """

    def __init__(self, grid_size=64, compressed_size=64, hidden_size=256,
                 num_layers=2, dropout=0.2):
        super().__init__()
        self.grid_size = grid_size
        flat = grid_size * grid_size

        # Encoder compresses the concentration grid
        self.encoder = nn.Linear(flat, compressed_size)

        # LSTM processes the sequence of (encoded_grid + aux features)
        self.lstm = nn.LSTM(
            input_size=compressed_size + 4,
            hidden_size=hidden_size,
            num_layers=num_layers,
            dropout=dropout,
            batch_first=True,
        )

        # Decoder maps hidden state back to a grid-shaped correction
        self.decoder = nn.Linear(hidden_size, flat)

    def forward(self, concentration_seq, aux_seq):
        """
        Parameters
        ----------
        concentration_seq : Tensor, shape (batch, seq_len, H*W)
            Flattened concentration grids per time step.
        aux_seq : Tensor, shape (batch, seq_len, 4)
            Auxiliary features per time step.

        Returns
        -------
        correction : Tensor, shape (batch, seq_len, H, W)
            Correction field to add to the physics prediction.
        """
        # Encode concentration grids
        encoded = torch.relu(self.encoder(concentration_seq))  # (B, T, C)

        # Concatenate with auxiliary features
        combined = torch.cat([encoded, aux_seq], dim=-1)       # (B, T, C+4)

        # LSTM pass
        lstm_out, _ = self.lstm(combined)                      # (B, T, H)

        # Decode to correction field
        flat_correction = self.decoder(lstm_out)               # (B, T, H*W)

        # Reshape to spatial grid
        B, T, _ = flat_correction.shape
        correction = flat_correction.view(B, T, self.grid_size, self.grid_size)
        return correction


# ---------------------------------------------------------------------------
# 4. ANAR discharge data (with fallback)
# ---------------------------------------------------------------------------

def fetch_river_discharge(lat=46.77, lon=23.59):
    """Fetch river discharge from ANAR API; fall back to synthetic data.

    Parameters
    ----------
    lat, lon : float
        Coordinates of the query point (used for the API request).

    Returns
    -------
    dict
        Keys: discharge_m3s, velocity_ms, water_level_m, timestamp,
        station, river.
    """
    from backend.config import ANAR_API_URL, ANAR_TIMEOUT

    try:
        resp = requests.get(
            ANAR_API_URL,
            params={"lat": lat, "lon": lon},
            timeout=ANAR_TIMEOUT,
        )
        resp.raise_for_status()
        return resp.json()
    except Exception:
        logger.info("ANAR API unavailable — using synthetic discharge data")
        from backend.utils.synthetic_data import generate_synthetic_river_discharge
        return generate_synthetic_river_discharge()


# ---------------------------------------------------------------------------
# 5. Full trajectory prediction pipeline
# ---------------------------------------------------------------------------

def predict_trajectory(initial_lat, initial_lon, hours=None,
                       grid_size=64, use_lstm_correction=False):
    """Predict pollutant dispersion from an initial point.

    Pipeline
    --------
    1. Initialise a concentration grid with a Gaussian at the centre.
    2. Fetch river discharge data (ANAR or mock).
    3. Generate a velocity field scaled by the current discharge.
    4. Iterate advection-diffusion steps up to each target hour.
    5. At each snapshot, extract concentration statistics and GeoJSON.

    Parameters
    ----------
    initial_lat, initial_lon : float
        Geographic coordinates of the pollution source.
    hours : list[int]
        Target prediction horizons (default [1, 6, 12, 24]).
    grid_size : int
        Spatial resolution of the simulation grid.
    use_lstm_correction : bool
        Whether to apply the LSTM correction layer (requires a trained
        model; disabled by default for demo).

    Returns
    -------
    dict
        ``hour_N`` keys each containing ``grid``, ``centroid`` [lat, lon],
        ``uncertainty_radius_km``, plus a top-level ``geojson``
        FeatureCollection.
    """
    from backend.config import DIFFUSION_COEFF, PREDICTION_DX, PREDICTION_DT

    if hours is None:
        hours = [1, 6, 12, 24]

    dx = PREDICTION_DX   # metres per cell
    D = DIFFUSION_COEFF

    # --- 1. Initialise concentration: Gaussian blob at grid centre ----------
    centre = grid_size // 2
    y_idx, x_idx = np.mgrid[0:grid_size, 0:grid_size]
    sigma_cells = 3.0
    concentration = np.exp(
        -((x_idx - centre) ** 2 + (y_idx - centre) ** 2) / (2 * sigma_cells ** 2)
    )

    # --- 2. Fetch discharge data -------------------------------------------
    discharge = fetch_river_discharge(initial_lat, initial_lon)
    base_velocity = discharge.get("velocity_ms", 0.8)

    # --- 3. Generate velocity field -----------------------------------------
    velocity_field = generate_velocity_field(grid_size, base_velocity=base_velocity)

    # --- Compute stable dt from CFL condition ---
    # Advection CFL: dt < dx / max(|u|)
    # Diffusion stability: dt < dx² / (4D)
    max_vel = max(np.abs(velocity_field).max(), 1e-6)
    dt_advection = 0.4 * dx / max_vel       # safety factor 0.4
    dt_diffusion = 0.4 * dx * dx / (4.0 * D)
    dt = min(dt_advection, dt_diffusion, PREDICTION_DT)
    logger.info("Prediction dt=%.1fs (CFL-limited: adv=%.1f, diff=%.1f)", dt, dt_advection, dt_diffusion)

    # --- 4. Iterate and snapshot at target hours ----------------------------
    results = {}
    geojson_features = []

    max_hour = max(hours)
    total_steps = int(max_hour * 3600 / dt)
    snapshot_steps = {h: int(h * 3600 / dt) for h in hours}

    current_step = 0
    for step in range(1, total_steps + 1):
        concentration = advection_diffusion_step(
            concentration, velocity_field, D, dt=dt, dx=dx
        )
        current_step = step

        # Check if we've hit a snapshot hour
        for h, target_step in snapshot_steps.items():
            if step == target_step:
                snapshot = _extract_snapshot(
                    concentration, h, initial_lat, initial_lon, dx, grid_size
                )
                results[f"hour_{h}"] = snapshot
                geojson_features.append(snapshot["geojson_feature"])

    results["geojson"] = {
        "type": "FeatureCollection",
        "features": geojson_features,
    }
    results["discharge"] = discharge

    return results


# ---------------------------------------------------------------------------
# Helper: extract statistics and GeoJSON from a snapshot
# ---------------------------------------------------------------------------

def _extract_snapshot(concentration, hour, origin_lat, origin_lon, dx, grid_size):
    """Build a result dict for a single time-horizon snapshot."""
    C = concentration.copy()
    # Replace any NaN/Inf with 0 for safety
    np.nan_to_num(C, copy=False, nan=0.0, posinf=0.0, neginf=0.0)
    c_max = C.max()

    # Avoid division by zero
    if c_max < 1e-12:
        return {
            "centroid": [origin_lat, origin_lon],
            "uncertainty_radius_km": 0.0,
            "geojson_feature": _empty_feature(hour, origin_lat, origin_lon),
        }

    # --- Centroid of mass (grid coordinates) ---
    y_idx, x_idx = np.mgrid[0:grid_size, 0:grid_size]
    total_mass = C.sum()
    cx = (C * x_idx).sum() / total_mass   # column (≈ lon direction)
    cy = (C * y_idx).sum() / total_mass   # row (≈ lat direction)

    # --- Uncertainty radius (std dev of mass distribution → km) ---
    var_x = (C * (x_idx - cx) ** 2).sum() / total_mass
    var_y = (C * (y_idx - cy) ** 2).sum() / total_mass
    std_cells = math.sqrt(var_x + var_y)
    uncertainty_km = std_cells * dx / 1000.0

    # --- Convert grid centroid to lat/lon ---
    centre = grid_size / 2.0
    # 1 degree lat ≈ 111 km, 1 degree lon ≈ 111·cos(lat) km
    deg_per_m_lat = 1.0 / 111_000.0
    deg_per_m_lon = 1.0 / (111_000.0 * math.cos(math.radians(origin_lat)))

    centroid_lat = origin_lat + (cy - centre) * dx * deg_per_m_lat
    centroid_lon = origin_lon + (cx - centre) * dx * deg_per_m_lon

    # --- GeoJSON polygon: convex hull of cells above 10 % of max ---
    threshold = 0.10 * c_max
    above = np.argwhere(C >= threshold)  # (row, col) pairs
    if len(above) < 3:
        geojson_feature = _empty_feature(hour, origin_lat, origin_lon)
    else:
        geojson_feature = _build_polygon_feature(
            above, hour, origin_lat, origin_lon, dx, grid_size
        )

    return {
        "centroid": [float(centroid_lat), float(centroid_lon)],
        "uncertainty_radius_km": round(float(uncertainty_km), 3),
        "max_concentration": float(c_max),
        "geojson_feature": geojson_feature,
    }


def _build_polygon_feature(above_cells, hour, origin_lat, origin_lon, dx, grid_size):
    """Build a GeoJSON Polygon from grid cells above threshold via convex hull."""
    from scipy.spatial import ConvexHull

    centre = grid_size / 2.0
    deg_per_m_lat = 1.0 / 111_000.0
    deg_per_m_lon = 1.0 / (111_000.0 * math.cos(math.radians(origin_lat)))

    # Convert cell indices to lat/lon
    points_ll = []
    for row, col in above_cells:
        lat = origin_lat + (row - centre) * dx * deg_per_m_lat
        lon = origin_lon + (col - centre) * dx * deg_per_m_lon
        points_ll.append([lon, lat])

    pts = np.array(points_ll)

    try:
        hull = ConvexHull(pts)
        hull_coords = [pts[i].tolist() for i in hull.vertices]
        # Close the ring
        hull_coords.append(hull_coords[0])
    except Exception:
        # Fallback: bounding box
        min_ll = pts.min(axis=0).tolist()
        max_ll = pts.max(axis=0).tolist()
        hull_coords = [
            min_ll, [max_ll[0], min_ll[1]], max_ll,
            [min_ll[0], max_ll[1]], min_ll,
        ]

    color_map = {1: "#ff6b6b", 6: "#ffa502", 12: "#ff7979", 24: "#badc58"}

    return {
        "type": "Feature",
        "properties": {
            "hour": hour,
            "color": color_map.get(hour, "#ffffff"),
            "opacity": max(0.2, 0.8 - hour * 0.025),
        },
        "geometry": {
            "type": "Polygon",
            "coordinates": [hull_coords],
        },
    }


def _empty_feature(hour, lat, lon):
    """Return a minimal GeoJSON point when no dispersion polygon exists."""
    return {
        "type": "Feature",
        "properties": {"hour": hour, "color": "#ffffff", "opacity": 0.3},
        "geometry": {"type": "Point", "coordinates": [lon, lat]},
    }
