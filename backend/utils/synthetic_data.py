"""
Synthetic data generators for the RAVENS aquatic pollution monitoring system.

Produces realistic fake LiDAR point clouds, thermal scenes, optical imagery,
and hydrological readings so that the full pipeline can be tested and
demonstrated without real sensor data.

Dependencies: numpy, scipy.ndimage (for Gaussian blurs).
"""

from __future__ import annotations

import datetime
import math

import numpy as np
from scipy.ndimage import gaussian_filter


# ---------------------------------------------------------------------------
# 1. Synthetic LAS-like point cloud
# ---------------------------------------------------------------------------

def generate_synthetic_point_cloud(
    n_waste_objects: int = 15,
    area_size: float = 200.0,
) -> tuple[np.ndarray, list[dict]]:
    """Generate a realistic LAS-like point cloud for a riverbank scene.

    The scene contains four semantic layers stacked together:

    * **Ground plane** -- flat terrain with a slight slope and brown/grey
      colouring.
    * **Vegetation** -- clusters of high-z-variance green points that mimic
      bushes or low trees.
    * **Water surface** -- a low, nearly-flat blue region.
    * **Waste objects** -- randomly distributed clusters whose geometry and
      colour depend on the waste category (plastic, metal, organic, or
      construction debris).

    Parameters
    ----------
    n_waste_objects : int
        Number of waste-object clusters to generate.
    area_size : float
        Side length (metres) of the square scene.

    Returns
    -------
    points : np.ndarray, shape (N, 7)
        Each row is ``[x, y, z, intensity, r, g, b]``.
    metadata : list[dict]
        One dict per waste object with keys ``category``, ``centroid_x``,
        ``centroid_y``, ``centroid_z``, and ``n_points`` (ground truth).
    """
    rng = np.random.default_rng()

    # ---- Ground plane (~5000 points) ------------------------------------
    n_ground = 5000
    gx = rng.uniform(0, area_size, n_ground)
    gy = rng.uniform(0, area_size, n_ground)
    # Slight slope along x-axis plus small noise
    gz = 0.01 * gx + rng.normal(0, 0.05, n_ground)
    g_intensity = np.full(n_ground, 40.0) + rng.normal(0, 3, n_ground)
    # Brown/grey colour with per-point jitter
    g_r = np.clip(140 + rng.normal(0, 10, n_ground), 0, 255)
    g_g = np.clip(120 + rng.normal(0, 10, n_ground), 0, 255)
    g_b = np.clip(90 + rng.normal(0, 10, n_ground), 0, 255)
    ground = np.column_stack([gx, gy, gz, g_intensity, g_r, g_g, g_b])

    # ---- Vegetation (~3000 points in 8-12 clusters) --------------------
    n_veg_clusters = rng.integers(8, 13)  # 8..12 inclusive
    veg_parts = []
    remaining = 3000
    for i in range(n_veg_clusters):
        # Divide points roughly evenly, give remainder to the last cluster
        n_pts = remaining // (n_veg_clusters - i)
        remaining -= n_pts

        cx = rng.uniform(0, area_size)
        cy = rng.uniform(0, area_size)
        # Gaussian spread around cluster centre
        vx = cx + rng.normal(0, 3.0, n_pts)
        vy = cy + rng.normal(0, 3.0, n_pts)
        # Vegetation z-range 0.5-3.0 m above ground at that x
        base_z = 0.01 * vx  # follow ground slope
        vz = base_z + rng.uniform(0.5, 3.0, n_pts)
        v_intensity = np.full(n_pts, 60.0) + rng.normal(0, 5, n_pts)
        v_r = np.clip(30 + rng.normal(0, 10, n_pts), 0, 255)
        v_g = np.clip(150 + rng.normal(0, 15, n_pts), 0, 255)
        v_b = np.clip(30 + rng.normal(0, 10, n_pts), 0, 255)
        veg_parts.append(np.column_stack([vx, vy, vz, v_intensity, v_r, v_g, v_b]))

    vegetation = np.vstack(veg_parts)

    # ---- Water surface (~2000 points) -----------------------------------
    n_water = 2000
    wx = rng.uniform(0, area_size, n_water)
    wy = rng.uniform(0, area_size * 0.3, n_water)  # river strip along one edge
    wz = -0.5 + rng.normal(0, 0.02, n_water)       # nearly flat, low z
    w_intensity = np.full(n_water, 30.0) + rng.normal(0, 2, n_water)
    w_r = np.clip(40 + rng.normal(0, 5, n_water), 0, 255)
    w_g = np.clip(60 + rng.normal(0, 5, n_water), 0, 255)
    w_b = np.clip(160 + rng.normal(0, 8, n_water), 0, 255)
    water = np.column_stack([wx, wy, wz, w_intensity, w_r, w_g, w_b])

    # ---- Waste objects --------------------------------------------------
    waste_categories = ["plastic", "metal", "organic", "construction"]
    waste_parts = []
    metadata: list[dict] = []

    for _ in range(n_waste_objects):
        category = rng.choice(waste_categories)
        # Random centre within the scene
        cx = rng.uniform(10, area_size - 10)
        cy = rng.uniform(10, area_size - 10)
        n_pts = rng.integers(100, 301)  # 100..300 points

        if category == "plastic":
            # Thin flat cluster with high planarity
            ox = cx + rng.normal(0, 0.3, n_pts)
            oy = cy + rng.normal(0, 0.3, n_pts)
            base_z = 0.01 * ox
            oz = base_z + rng.uniform(0.01, 0.05, n_pts)
            o_intensity = np.full(n_pts, 80.0) + rng.normal(0, 5, n_pts)
            # White/blue/transparent-ish
            o_r = np.clip(200 + rng.normal(0, 15, n_pts), 0, 255)
            o_g = np.clip(200 + rng.normal(0, 15, n_pts), 0, 255)
            o_b = np.clip(220 + rng.normal(0, 10, n_pts), 0, 255)

        elif category == "metal":
            # Cylindrical cluster (points on cylinder surface)
            radius = rng.uniform(0.15, 0.3)
            height = rng.uniform(0.3, 0.8)
            theta = rng.uniform(0, 2 * np.pi, n_pts)
            h = rng.uniform(0, height, n_pts)
            ox = cx + radius * np.cos(theta)
            oy = cy + radius * np.sin(theta)
            base_z = 0.01 * ox
            oz = base_z + h
            o_intensity = np.full(n_pts, 120.0) + rng.normal(0, 8, n_pts)
            # Grey, metallic
            o_r = np.clip(160 + rng.normal(0, 10, n_pts), 0, 255)
            o_g = np.clip(160 + rng.normal(0, 10, n_pts), 0, 255)
            o_b = np.clip(160 + rng.normal(0, 10, n_pts), 0, 255)

        elif category == "organic":
            # Irregular low mound
            ox = cx + rng.normal(0, 0.4, n_pts)
            oy = cy + rng.normal(0, 0.4, n_pts)
            base_z = 0.01 * ox
            oz = base_z + rng.uniform(0.05, 0.2, n_pts)
            o_intensity = np.full(n_pts, 50.0) + rng.normal(0, 5, n_pts)
            # Brown
            o_r = np.clip(120 + rng.normal(0, 10, n_pts), 0, 255)
            o_g = np.clip(90 + rng.normal(0, 10, n_pts), 0, 255)
            o_b = np.clip(50 + rng.normal(0, 8, n_pts), 0, 255)

        else:  # construction
            # Large irregular blocks
            ox = cx + rng.normal(0, 1.0, n_pts)
            oy = cy + rng.normal(0, 1.0, n_pts)
            base_z = 0.01 * ox
            oz = base_z + rng.uniform(0.2, 1.0, n_pts)
            o_intensity = np.full(n_pts, 90.0) + rng.normal(0, 8, n_pts)
            # Grey concrete
            o_r = np.clip(180 + rng.normal(0, 12, n_pts), 0, 255)
            o_g = np.clip(180 + rng.normal(0, 12, n_pts), 0, 255)
            o_b = np.clip(180 + rng.normal(0, 12, n_pts), 0, 255)

        obj_cloud = np.column_stack([ox, oy, oz, o_intensity, o_r, o_g, o_b])
        waste_parts.append(obj_cloud)

        # Ground-truth metadata for this waste object
        metadata.append({
            "category": category,
            "centroid_x": float(np.mean(ox)),
            "centroid_y": float(np.mean(oy)),
            "centroid_z": float(np.mean(oz)),
            "n_points": int(n_pts),
        })

    # Combine all layers into a single array
    all_parts = [ground, vegetation, water] + waste_parts
    points = np.vstack(all_parts)

    return points, metadata


# ---------------------------------------------------------------------------
# 2. Synthetic thermal scene
# ---------------------------------------------------------------------------

def generate_synthetic_thermal_scene(grid_size: int = 128) -> np.ndarray:
    """Generate a 2-D temperature matrix simulating an aerial thermal image.

    The scene models three phenomena:

    * **Background water** at ~13.5 C with slight random noise.
    * **Industrial discharge plumes** (1-2 Gaussian hotspots with
      delta_T = +8 to +12 C above background).
    * **A natural warm tributary** rendered as a diagonal band with
      delta_T = +2 C.

    Parameters
    ----------
    grid_size : int
        Side length of the square output grid (pixels / cells).

    Returns
    -------
    temperature : np.ndarray, shape (grid_size, grid_size)
        Temperature in degrees Celsius.
    """
    rng = np.random.default_rng()

    # Background water: 13.5 C + small noise
    temperature = 13.5 + rng.uniform(-0.5, 0.5, (grid_size, grid_size))

    # ---- Industrial discharge plumes (1-2 Gaussian hotspots) ------------
    n_plumes = rng.integers(1, 3)  # 1 or 2
    for _ in range(n_plumes):
        # Random centre within the grid
        cy = rng.integers(grid_size // 4, 3 * grid_size // 4)
        cx = rng.integers(grid_size // 4, 3 * grid_size // 4)
        sigma = rng.uniform(10, 20)
        peak_dt = rng.uniform(8.0, 12.0)

        # Build a 2-D Gaussian hotspot
        yy, xx = np.mgrid[0:grid_size, 0:grid_size]
        gauss = np.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * sigma ** 2))
        temperature += peak_dt * gauss

    # ---- Natural warm tributary (diagonal band, ~5 cells wide) ----------
    yy, xx = np.mgrid[0:grid_size, 0:grid_size]
    # Diagonal line: y = x + offset; distance from that line
    offset = rng.uniform(-grid_size * 0.3, grid_size * 0.3)
    dist = np.abs(yy - xx - offset) / math.sqrt(2)
    band_width = 5.0
    # Smooth falloff using a clipped linear profile
    tributary = np.clip(1.0 - dist / band_width, 0, 1) * 2.0
    temperature += tributary

    return temperature


# ---------------------------------------------------------------------------
# 3. Synthetic river discharge (mock ANAR API response)
# ---------------------------------------------------------------------------

def generate_synthetic_river_discharge() -> dict:
    """Return a mock ANAR hydrological-station API response.

    The discharge follows a seasonal sinusoidal pattern between 50 and
    300 m3/s, peaking around day-of-year 120 (late April / spring melt)
    and reaching a minimum near day 240 (late August).  Velocity and water
    level are derived from discharge so they stay physically correlated.

    Returns
    -------
    response : dict
        Keys: ``discharge_m3s``, ``velocity_ms``, ``water_level_m``,
        ``timestamp`` (ISO-8601), ``station``, ``river``.
    """
    rng = np.random.default_rng()

    now = datetime.datetime.now(datetime.timezone.utc)
    day_of_year = now.timetuple().tm_yday

    # Seasonal sinusoid: peak at day 120, min at day 120+182.5 ~ day 302.
    # Shift phase so that cos peaks when day_of_year == 120.
    phase = 2 * math.pi * (day_of_year - 120) / 365.0
    # Map cosine [-1, 1] to discharge range [50, 300]
    base_discharge = 175.0 + 125.0 * math.cos(phase)
    discharge = base_discharge + rng.normal(0, 15)
    discharge = float(np.clip(discharge, 50, 300))

    # Velocity correlated with discharge (linear map to 0.3-1.2 m/s)
    velocity = 0.3 + 0.9 * (discharge - 50) / 250
    velocity += rng.normal(0, 0.05)
    velocity = float(np.clip(velocity, 0.3, 1.2))

    # Water level correlated with discharge (linear map to roughly 1-5 m)
    water_level = 1.0 + 4.0 * (discharge - 50) / 250
    water_level += rng.normal(0, 0.1)
    water_level = float(np.clip(water_level, 1.0, 5.0))

    return {
        "discharge_m3s": round(discharge, 2),
        "velocity_ms": round(velocity, 3),
        "water_level_m": round(water_level, 2),
        "timestamp": now.isoformat(),
        "station": "Someș - Dej",
        "river": "Someș",
    }


# ---------------------------------------------------------------------------
# 4. Synthetic optical (RGB) scene
# ---------------------------------------------------------------------------

def generate_synthetic_optical_scene(grid_size: int = 256) -> np.ndarray:
    """Generate a synthetic aerial RGB image of a polluted water surface.

    The image contains:

    * **Water background** -- dark blue-green.
    * **Oil / hydrocarbon patches** (1-2) -- iridescent blobs with high hue
      variance (rainbow-ish colours).
    * **Foam region** (1) -- a white/grey patch.
    * **Suspended sediment plume** -- a diffuse brownish region.

    Parameters
    ----------
    grid_size : int
        Side length of the square output image.

    Returns
    -------
    image : np.ndarray, shape (grid_size, grid_size, 3), dtype uint8
        Synthetic RGB image.
    """
    rng = np.random.default_rng()

    # Start with a water background (dark blue-green)
    image = np.zeros((grid_size, grid_size, 3), dtype=np.float64)
    image[:, :, 0] = 30 + rng.normal(0, 3, (grid_size, grid_size))   # R
    image[:, :, 1] = 80 + rng.normal(0, 3, (grid_size, grid_size))   # G
    image[:, :, 2] = 100 + rng.normal(0, 3, (grid_size, grid_size))  # B

    yy, xx = np.mgrid[0:grid_size, 0:grid_size]

    # ---- Oil / hydrocarbon patches (1-2 iridescent blobs) ---------------
    n_oil = rng.integers(1, 3)  # 1 or 2
    for _ in range(n_oil):
        cy = rng.integers(grid_size // 4, 3 * grid_size // 4)
        cx = rng.integers(grid_size // 4, 3 * grid_size // 4)
        sigma = rng.uniform(grid_size * 0.05, grid_size * 0.12)

        # Blob mask (Gaussian falloff)
        blob = np.exp(-((xx - cx) ** 2 + (yy - cy) ** 2) / (2 * sigma ** 2))

        # Iridescent colour: hue varies spatially across the blob.
        # Use sine waves at different frequencies per channel to create
        # rainbow-like interference patterns.
        freq = rng.uniform(0.04, 0.08)
        phase_r = rng.uniform(0, 2 * np.pi)
        phase_g = rng.uniform(0, 2 * np.pi)
        phase_b = rng.uniform(0, 2 * np.pi)

        rainbow_r = 128 + 127 * np.sin(freq * xx + phase_r)
        rainbow_g = 128 + 127 * np.sin(freq * yy + phase_g)
        rainbow_b = 128 + 127 * np.sin(freq * (xx + yy) + phase_b)

        # Blend the iridescent colour into the image where the blob is strong
        image[:, :, 0] += blob * (rainbow_r - image[:, :, 0]) * 0.8
        image[:, :, 1] += blob * (rainbow_g - image[:, :, 1]) * 0.8
        image[:, :, 2] += blob * (rainbow_b - image[:, :, 2]) * 0.8

    # ---- Foam region (white/grey patch) ---------------------------------
    fy = rng.integers(grid_size // 4, 3 * grid_size // 4)
    fx = rng.integers(grid_size // 4, 3 * grid_size // 4)
    foam_sigma = rng.uniform(grid_size * 0.04, grid_size * 0.08)
    foam_mask = np.exp(-((xx - fx) ** 2 + (yy - fy) ** 2) / (2 * foam_sigma ** 2))
    # Threshold to make the patch less perfectly round
    foam_mask = np.where(foam_mask > 0.3, foam_mask, 0)

    foam_r = 220 + rng.normal(0, 5, (grid_size, grid_size))
    foam_g = 220 + rng.normal(0, 5, (grid_size, grid_size))
    foam_b = 215 + rng.normal(0, 5, (grid_size, grid_size))

    image[:, :, 0] += foam_mask * (foam_r - image[:, :, 0])
    image[:, :, 1] += foam_mask * (foam_g - image[:, :, 1])
    image[:, :, 2] += foam_mask * (foam_b - image[:, :, 2])

    # ---- Suspended sediment plume (brownish, diffuse) -------------------
    # Create a random blob then blur it heavily for a plume look
    sed_cy = rng.integers(grid_size // 4, 3 * grid_size // 4)
    sed_cx = rng.integers(grid_size // 4, 3 * grid_size // 4)
    sed_sigma = rng.uniform(grid_size * 0.08, grid_size * 0.15)
    sed_mask = np.exp(-((xx - sed_cx) ** 2 + (yy - sed_cy) ** 2) / (2 * sed_sigma ** 2))
    # Blur to make edges more natural
    sed_mask = gaussian_filter(sed_mask, sigma=grid_size * 0.03)

    sed_r = 140 + rng.normal(0, 5, (grid_size, grid_size))
    sed_g = 110 + rng.normal(0, 5, (grid_size, grid_size))
    sed_b = 70 + rng.normal(0, 5, (grid_size, grid_size))

    image[:, :, 0] += sed_mask * (sed_r - image[:, :, 0]) * 0.7
    image[:, :, 1] += sed_mask * (sed_g - image[:, :, 1]) * 0.7
    image[:, :, 2] += sed_mask * (sed_b - image[:, :, 2]) * 0.7

    # Clip to valid range and convert to uint8
    image = np.clip(image, 0, 255).astype(np.uint8)

    return image
