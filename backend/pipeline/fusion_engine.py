"""
RAVENS Aquatic Pollution Monitoring -- Multi-Sensor Fusion Pipeline

Fuses thermal infrared, optical (RGB), and LiDAR point-cloud data to
detect and classify illegal dumping events in waterways.
"""

import logging

import numpy as np
from scipy import ndimage

logger = logging.getLogger(__name__)


# ---------------------------------------------------------------------------
# Function 1 -- Thermal anomaly detection
# ---------------------------------------------------------------------------

def detect_thermal_anomalies(thermal_matrix, background_temp=None, threshold_dt=3.0):
    """Detect thermal anomalies in a 2D temperature grid.

    Algorithm
    ---------
    1. Compute local background using ``scipy.ndimage.median_filter``
       (kernel size 15).
    2. Compute ``delta_T = thermal_matrix - local_background``.
    3. Threshold: anomaly pixels where ``delta_T >= threshold_dt``.
    4. Label connected components using ``scipy.ndimage.label``.
    5. For each labeled region compute centroid, area, max/mean delta_T,
       severity, and a normalised score.

    Parameters
    ----------
    thermal_matrix : np.ndarray
        2-D array of temperature values (degrees C).
    background_temp : float or None
        If provided, used as a uniform background instead of the
        adaptive median filter.
    threshold_dt : float
        Minimum delta_T (degrees C) to flag a pixel as anomalous.

    Returns
    -------
    list[dict]
        Each dict contains:
        ``id, centroid_row, centroid_col, area, max_delta_t, mean_delta_t,
        severity, score``

        ``score`` is ``min(max_delta_t / 15.0, 1.0)`` -- normalised thermal
        score in [0, 1].
    """
    thermal_matrix = np.asarray(thermal_matrix, dtype=np.float64)

    # Step 1 -- local background estimation
    if background_temp is not None:
        local_background = np.full_like(thermal_matrix, float(background_temp))
    else:
        local_background = ndimage.median_filter(thermal_matrix, size=15)

    # Step 2 -- temperature deviation from background
    delta_t = thermal_matrix - local_background

    # Step 3 -- binary anomaly mask
    anomaly_mask = delta_t >= threshold_dt

    # Step 4 -- connected-component labelling
    labeled, num_features = ndimage.label(anomaly_mask)

    # Step 5 -- per-region statistics
    anomalies = []
    for region_id in range(1, num_features + 1):
        region_mask = labeled == region_id
        region_deltas = delta_t[region_mask]

        # Centroid (row, col)
        rows, cols = np.where(region_mask)
        centroid_row = float(rows.mean())
        centroid_col = float(cols.mean())

        area = int(region_mask.sum())
        max_dt = float(region_deltas.max())
        mean_dt = float(region_deltas.mean())

        # Severity classification based on max_delta_T
        if max_dt > 8.0:
            severity = "HIGH"
        elif max_dt >= 5.0:
            severity = "MEDIUM"
        else:
            severity = "LOW"

        # Normalised score (0-1)
        score = min(max_dt / 15.0, 1.0)

        anomalies.append({
            "id": region_id,
            "centroid_row": centroid_row,
            "centroid_col": centroid_col,
            "area": area,
            "max_delta_t": max_dt,
            "mean_delta_t": mean_dt,
            "severity": severity,
            "score": score,
        })

    logger.info("Thermal analysis: %d anomalies detected", len(anomalies))
    return anomalies


# ---------------------------------------------------------------------------
# Function 2 -- Optical substance classification
# ---------------------------------------------------------------------------

def _rgb_to_hsv(image):
    """Convert a uint8 RGB image (H, W, 3) to HSV with H in [0, 180),
    S in [0, 255], V in [0, 255] -- matching the OpenCV convention so
    that downstream thresholds are intuitive.

    Parameters
    ----------
    image : np.ndarray  (H, W, 3), dtype uint8

    Returns
    -------
    np.ndarray (H, W, 3), dtype float64
        Channels: H [0, 180), S [0, 255], V [0, 255].
    """
    img = image.astype(np.float64) / 255.0  # normalise to 0-1
    r, g, b = img[..., 0], img[..., 1], img[..., 2]

    cmax = np.maximum(np.maximum(r, g), b)
    cmin = np.minimum(np.minimum(r, g), b)
    diff = cmax - cmin

    # Hue (degrees, 0-360 then scaled to 0-180)
    h = np.zeros_like(cmax)
    mask_r = (cmax == r) & (diff > 0)
    mask_g = (cmax == g) & (diff > 0)
    mask_b = (cmax == b) & (diff > 0)
    h[mask_r] = (60.0 * ((g[mask_r] - b[mask_r]) / diff[mask_r])) % 360.0
    h[mask_g] = (60.0 * ((b[mask_g] - r[mask_g]) / diff[mask_g]) + 120.0) % 360.0
    h[mask_b] = (60.0 * ((r[mask_b] - g[mask_b]) / diff[mask_b]) + 240.0) % 360.0
    h = h / 2.0  # scale 0-360 -> 0-180

    # Saturation (0-255)
    s = np.where(cmax > 0, (diff / cmax) * 255.0, 0.0)

    # Value (0-255)
    v = cmax * 255.0

    return np.stack([h, s, v], axis=-1)


def classify_substance_optical(image_patch, roi=None):
    """Classify substance type from an RGB image patch using colour
    histogram analysis.

    Algorithm
    ---------
    1. Convert RGB to HSV using a pure-numpy implementation.
    2. Analyse HSV properties within the ROI (or the full patch):

       * **Hydrocarbon / oil** -- high hue variance (``std(H) > 30``) AND
         moderate saturation.
       * **Industrial foam** -- low saturation (``mean(S) < 30``) AND high
         value (``mean(V) > 180``).
       * **Suspended sediment** -- hue in brown/tan range (15-35) AND
         moderate saturation.
       * **Chemical discoloration** -- hue outside normal water range
         (90-130) AND high saturation (``mean(S) > 100``).
       * **Clean water** (default) -- hue in 90-130 range, low saturation.

    3. Confidence reflects how strongly the signature matches.

    Parameters
    ----------
    image_patch : np.ndarray
        (H, W, 3) uint8 RGB image.
    roi : np.ndarray or None
        Boolean mask (H, W) selecting pixels of interest.  If ``None``
        the entire patch is used.

    Returns
    -------
    dict
        ``substance_type`` : str
        ``confidence``     : float (0-1, also used as the fusion score)
        ``color_signature``: dict with mean H, S, V values
    """
    image_patch = np.asarray(image_patch, dtype=np.uint8)
    hsv = _rgb_to_hsv(image_patch)

    # Apply ROI mask if provided
    if roi is not None:
        roi = np.asarray(roi, dtype=bool)
        pixels = hsv[roi]
    else:
        pixels = hsv.reshape(-1, 3)

    if pixels.size == 0:
        return {
            "substance_type": "unknown",
            "confidence": 0.0,
            "color_signature": {"mean_h": 0.0, "mean_s": 0.0, "mean_v": 0.0},
        }

    mean_h = float(pixels[:, 0].mean())
    mean_s = float(pixels[:, 1].mean())
    mean_v = float(pixels[:, 2].mean())
    std_h = float(pixels[:, 0].std())

    color_signature = {"mean_h": mean_h, "mean_s": mean_s, "mean_v": mean_v}

    # --- Classification rules (evaluated in priority order) ---

    # Hydrocarbon / oil: high hue variance + moderate saturation
    if std_h > 30 and 30 <= mean_s <= 150:
        substance = "hydrocarbon"
        # Confidence scales with hue variance above the threshold
        confidence = min((std_h - 30) / 40.0, 1.0) * 0.6 + 0.4

    # Industrial foam: very low saturation + bright
    elif mean_s < 30 and mean_v > 180:
        substance = "industrial_foam"
        confidence = min((mean_v - 180) / 75.0, 1.0) * 0.5 + 0.5

    # Suspended sediment: hue in brown/tan range (15-35 on 0-180 scale)
    elif 15 <= mean_h <= 35 and 30 <= mean_s <= 150:
        substance = "suspended_sediment"
        # Stronger confidence when hue is centred on ~25
        hue_dist = abs(mean_h - 25.0)
        confidence = max(0.4, 1.0 - hue_dist / 20.0)

    # Chemical discoloration: hue outside normal water (90-130), high saturation
    elif (mean_h < 90 or mean_h > 130) and mean_s > 100:
        substance = "chemical_discoloration"
        confidence = min(mean_s / 200.0, 1.0) * 0.6 + 0.3

    # Default -- clean water (hue 90-130, low-ish saturation)
    else:
        substance = "clean_water"
        confidence = 0.1  # low score: nothing suspicious

    logger.info(
        "Optical classification: %s (confidence=%.2f)", substance, confidence
    )

    return {
        "substance_type": substance,
        "confidence": confidence,
        "color_signature": color_signature,
    }


# ---------------------------------------------------------------------------
# Function 3 -- Hidden infrastructure detection from LiDAR point cloud
# ---------------------------------------------------------------------------

def detect_hidden_infrastructure(points):
    """Detect cylindrical or planar structures in a point cloud that are
    inconsistent with natural terrain (e.g. concealed discharge pipes,
    retaining walls).

    Algorithm
    ---------
    1. **Cylinder / pipe detection** (simplified RANSAC):
       - Run 200 iterations.  Each iteration samples 3 random points,
         derives a candidate axis via the cross product of two edge
         vectors, projects all points onto the perpendicular plane, and
         fits a circle (centre + radius) in that 2-D projection.
       - Inliers are points within a distance threshold of the cylinder
         surface.
       - Accept cylinders with radius in [0.05, 0.5] m and > 50 inliers.

    2. **Vertical plane (wall) detection** (RANSAC):
       - Run 200 iterations, each sampling 3 points to define a plane.
       - Keep planes whose normal is nearly horizontal
         (``|normal_z| < 0.3``).
       - Require > 50 inliers (distance to plane < threshold).

    3. Return detected structures.

    Parameters
    ----------
    points : np.ndarray
        (N, 3) array of XYZ coordinates.

    Returns
    -------
    list[dict]
        Each dict has ``type`` ("pipe" or "wall"), ``position`` (x, y, z),
        ``confidence``, and either ``radius`` (pipes) or ``normal``
        (walls).

        Fusion score: ``min(len(structures) / 3.0, 1.0)``.
    """
    points = np.asarray(points, dtype=np.float64)
    if points.ndim != 2 or points.shape[1] != 3 or len(points) < 10:
        logger.info("LiDAR: insufficient points (%s), skipping", points.shape)
        return []

    structures = []
    n_points = len(points)
    rng = np.random.default_rng(42)  # deterministic for reproducibility

    # ---- 1. Cylinder / pipe detection (simplified RANSAC) ----------------
    best_pipe = None
    best_pipe_inliers = 0
    dist_thresh_cyl = 0.03  # 3 cm tolerance

    for _ in range(200):
        # Sample 3 random points
        idx = rng.choice(n_points, size=3, replace=False)
        p0, p1, p2 = points[idx]

        # Candidate axis direction from cross product of two edge vectors
        v1 = p1 - p0
        v2 = p2 - p0
        axis = np.cross(v1, v2)
        axis_norm = np.linalg.norm(axis)
        if axis_norm < 1e-8:
            continue  # degenerate (collinear points)
        axis = axis / axis_norm

        # Project all points onto the plane perpendicular to the axis
        # relative to the centroid of the three seed points
        origin = (p0 + p1 + p2) / 3.0
        relative = points - origin
        along_axis = relative @ axis  # scalar projections
        projected_2d = relative - np.outer(along_axis, axis)  # remove axis component

        # Build a local 2-D coordinate system in the perpendicular plane
        # Pick an arbitrary vector perpendicular to axis
        if abs(axis[0]) < 0.9:
            ref = np.array([1.0, 0.0, 0.0])
        else:
            ref = np.array([0.0, 1.0, 0.0])
        u = np.cross(axis, ref)
        u = u / np.linalg.norm(u)
        v = np.cross(axis, u)

        coords_u = projected_2d @ u
        coords_v = projected_2d @ v

        # Fit circle to the 2-D projection (algebraic least-squares)
        # Model: (u - cu)^2 + (v - cv)^2 = r^2
        # Linearised: 2*cu*u + 2*cv*v + (r^2 - cu^2 - cv^2) = u^2 + v^2
        A = np.column_stack([2 * coords_u, 2 * coords_v, np.ones(n_points)])
        b_vec = coords_u ** 2 + coords_v ** 2
        result, _, _, _ = np.linalg.lstsq(A, b_vec, rcond=None)
        cu, cv, w = result
        radius = np.sqrt(w + cu ** 2 + cv ** 2)

        # Filter by acceptable pipe radius
        if radius < 0.05 or radius > 0.5:
            continue

        # Count inliers (distance to cylinder surface)
        dist_to_centre = np.sqrt((coords_u - cu) ** 2 + (coords_v - cv) ** 2)
        inlier_mask = np.abs(dist_to_centre - radius) < dist_thresh_cyl
        n_inliers = int(inlier_mask.sum())

        if n_inliers > best_pipe_inliers and n_inliers > 50:
            best_pipe_inliers = n_inliers
            # Pipe position in world coordinates
            centre_3d = origin + cu * u + cv * v
            best_pipe = {
                "type": "pipe",
                "position": centre_3d.tolist(),
                "confidence": min(n_inliers / float(n_points), 1.0),
                "radius": float(radius),
            }

    if best_pipe is not None:
        structures.append(best_pipe)
        logger.info(
            "LiDAR: pipe detected (r=%.3f m, %d inliers)",
            best_pipe["radius"],
            best_pipe_inliers,
        )

    # ---- 2. Vertical plane / wall detection (RANSAC) ---------------------
    best_wall = None
    best_wall_inliers = 0
    dist_thresh_plane = 0.05  # 5 cm tolerance

    for _ in range(200):
        idx = rng.choice(n_points, size=3, replace=False)
        p0, p1, p2 = points[idx]

        # Plane normal
        normal = np.cross(p1 - p0, p2 - p0)
        normal_len = np.linalg.norm(normal)
        if normal_len < 1e-8:
            continue
        normal = normal / normal_len

        # Keep only near-vertical planes (horizontal normal -> |n_z| small)
        if abs(normal[2]) >= 0.3:
            continue

        # Distance of every point to the plane
        d = np.abs((points - p0) @ normal)
        inlier_mask = d < dist_thresh_plane
        n_inliers = int(inlier_mask.sum())

        if n_inliers > best_wall_inliers and n_inliers > 50:
            best_wall_inliers = n_inliers
            centroid = points[inlier_mask].mean(axis=0)
            best_wall = {
                "type": "wall",
                "position": centroid.tolist(),
                "confidence": min(n_inliers / float(n_points), 1.0),
                "normal": normal.tolist(),
            }

    if best_wall is not None:
        structures.append(best_wall)
        logger.info("LiDAR: wall detected (%d inliers)", best_wall_inliers)

    if not structures:
        logger.info("LiDAR: no artificial structures detected")

    return structures


# ---------------------------------------------------------------------------
# Function 4 -- Ensemble classification
# ---------------------------------------------------------------------------

def ensemble_classify_dumping(thermal_result, optical_result, lidar_result):
    """Weighted ensemble scoring for illegal dumping classification.

    Combines evidence from thermal, optical, and LiDAR analyses into a
    single confidence score and categorical label.

    Parameters
    ----------
    thermal_result : list[dict]
        Output of :func:`detect_thermal_anomalies`.  The maximum ``score``
        across all anomalies is used; 0 if the list is empty.
    optical_result : dict
        Output of :func:`classify_substance_optical`.  The ``confidence``
        field is used directly as the optical score.
    lidar_result : list[dict]
        Output of :func:`detect_hidden_infrastructure`.
        Score: ``min(len(lidar_result) / 3.0, 1.0)``.

    Weights
    -------
    thermal = 0.45, optical = 0.35, lidar = 0.20

    Classification thresholds:
        * >= 0.7  -- ``"CONFIRMED"``
        * 0.4-0.7 -- ``"SUSPECTED"``
        * < 0.4   -- ``"NEGATIVE"``

    Returns
    -------
    dict
        ``classification`` : str
        ``confidence``     : float (the weighted score)
        ``evidence``       : dict with ``thermal_score, optical_score,
        lidar_score, thermal_anomalies, substance_type, structures``
    """
    # --- Derive per-sensor scores ---
    if thermal_result:
        thermal_score = max(a["score"] for a in thermal_result)
    else:
        thermal_score = 0.0

    optical_score = optical_result.get("confidence", 0.0)

    lidar_score = min(len(lidar_result) / 3.0, 1.0) if lidar_result else 0.0

    # --- Weighted fusion ---
    score = 0.45 * thermal_score + 0.35 * optical_score + 0.20 * lidar_score

    # --- Classification ---
    if score >= 0.7:
        classification = "CONFIRMED"
    elif score >= 0.4:
        classification = "SUSPECTED"
    else:
        classification = "NEGATIVE"

    logger.info(
        "Ensemble: %s (score=%.3f  T=%.2f O=%.2f L=%.2f)",
        classification, score, thermal_score, optical_score, lidar_score,
    )

    return {
        "classification": classification,
        "confidence": score,
        "evidence": {
            "thermal_score": thermal_score,
            "optical_score": optical_score,
            "lidar_score": lidar_score,
            "thermal_anomalies": thermal_result,
            "substance_type": optical_result.get("substance_type", "unknown"),
            "structures": lidar_result,
        },
    }


# ---------------------------------------------------------------------------
# Function 5 -- Full pipeline orchestration
# ---------------------------------------------------------------------------

def run_fusion_pipeline(thermal_matrix, optical_image, points=None):
    """Orchestrate the complete multi-sensor fusion pipeline.

    Steps
    -----
    1. Run :func:`detect_thermal_anomalies` on *thermal_matrix*.
    2. Run :func:`classify_substance_optical` on *optical_image*.
    3. Run :func:`detect_hidden_infrastructure` on *points* (skipped when
       *points* is ``None``).
    4. Combine via :func:`ensemble_classify_dumping`.

    Parameters
    ----------
    thermal_matrix : np.ndarray
        2-D temperature array.
    optical_image : np.ndarray
        (H, W, 3) uint8 RGB image.
    points : np.ndarray or None
        (N, 3) LiDAR point cloud.  If ``None`` the LiDAR score is 0.

    Returns
    -------
    dict
        The ensemble result from :func:`ensemble_classify_dumping`.
    """
    logger.info("Starting RAVENS fusion pipeline")

    # 1. Thermal analysis
    thermal_result = detect_thermal_anomalies(thermal_matrix)

    # 2. Optical substance classification
    optical_result = classify_substance_optical(optical_image)

    # 3. LiDAR infrastructure detection (optional)
    if points is not None:
        lidar_result = detect_hidden_infrastructure(points)
    else:
        lidar_result = []

    # 4. Ensemble classification
    result = ensemble_classify_dumping(thermal_result, optical_result, lidar_result)

    logger.info("Fusion pipeline complete: %s", result["classification"])
    return result
