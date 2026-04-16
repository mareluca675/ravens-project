"""
LiDAR Point Cloud Processing Pipeline for RAVENS Aquatic Pollution Monitoring.

Implements Statistical Outlier Removal, RANSAC ground plane fitting,
DBSCAN clustering, and PCA-based feature extraction — all from scratch.

Dependencies: numpy, scipy (KDTree only), logging, collections.deque.
"""

import logging
from collections import deque

import numpy as np
from sklearn.neighbors import KDTree

logger = logging.getLogger(__name__)


def statistical_outlier_removal(points, k=20, std_ratio=2.0):
    """Remove statistical outliers from a point cloud using SOR.

    For each point, computes the mean distance to its k nearest neighbors.
    A point is an outlier if its mean neighbor distance exceeds a global
    threshold defined by:

        threshold = mu + alpha * sigma

    where:
        mu    = global mean of all per-point mean neighbor distances
        sigma = global standard deviation of those distances
        alpha = std_ratio parameter

    Parameters
    ----------
    points : np.ndarray, shape (N, C)
        Point cloud with at least 3 columns (X, Y, Z, ...).
    k : int
        Number of nearest neighbors to consider (excluding the point itself).
    std_ratio : float
        Multiplier for the standard deviation threshold (alpha).

    Returns
    -------
    clean_points : np.ndarray, shape (M, C)
        Points that are NOT outliers.
    outlier_mask : np.ndarray, shape (N,), dtype bool
        True where the corresponding point IS an outlier.

    Complexity
    ----------
    O(N * k * log(N)) — each of the N KDTree queries costs O(k * log(N)).
    """
    n = points.shape[0]
    if n == 0:
        return points.copy(), np.zeros(0, dtype=bool)

    xyz = points[:, :3]

    # Step 1: Build a KDTree over the XYZ coordinates.
    tree = KDTree(xyz)

    # Step 2: For each point, find the k nearest neighbors.
    # query returns (distances, indices). k+1 because the point itself is
    # included as its own nearest neighbor at distance 0.
    distances, _ = tree.query(xyz, k=k + 1)

    # Exclude self-distance (column 0) and compute per-point mean distance.
    # distances shape: (N, k+1) — columns 1..k are the actual neighbors.
    mean_distances = distances[:, 1:].mean(axis=1)  # shape (N,)

    # Step 3: Compute global statistics across all mean distances.
    global_mean = mean_distances.mean()
    global_std = mean_distances.std()

    # Step 4: A point is an outlier if its mean neighbor distance exceeds
    # the threshold:  mean_distance > mu + alpha * sigma
    threshold = global_mean + std_ratio * global_std
    outlier_mask = mean_distances > threshold

    # Step 5: Return clean (non-outlier) points and the boolean mask.
    clean_points = points[~outlier_mask]

    logger.info(
        "SOR: removed %d / %d outliers (%.1f%%) — threshold=%.4f",
        outlier_mask.sum(), n, 100.0 * outlier_mask.sum() / n, threshold,
    )

    return clean_points, outlier_mask


def remove_ground_plane(points, distance_threshold=0.15, ransac_n=3, num_iterations=1000):
    """Fit and remove the ground plane via RANSAC.

    A plane in 3-D is defined by:

        ax + by + cz + d = 0

    where (a, b, c) is the unit normal. The signed distance from a point
    p = (x, y, z) to the plane is:

        dist = |a*x + b*y + c*z + d| / sqrt(a^2 + b^2 + c^2)

    RANSAC procedure:
        1. Sample 3 random points to define a plane candidate.
        2. Compute the plane normal via the cross product of two edge vectors.
        3. Measure every point's distance to this candidate plane.
        4. Count inliers (distance < distance_threshold).
        5. Keep the model with the most inliers after all iterations.

    Parameters
    ----------
    points : np.ndarray, shape (N, C)
        Point cloud (first 3 columns are X, Y, Z).
    distance_threshold : float
        Maximum distance from the plane for a point to be an inlier.
    ransac_n : int
        Number of points sampled per iteration (must be >= 3).
    num_iterations : int
        Number of RANSAC iterations.

    Returns
    -------
    non_ground_points : np.ndarray, shape (M, C)
        Points classified as NOT ground (distance > threshold with best model).
    ground_points : np.ndarray, shape (K, C)
        Points classified as ground (inliers of best model).

    Complexity
    ----------
    O(num_iterations * N) — each iteration evaluates all N points against
    the candidate plane.
    """
    n = points.shape[0]
    if n < ransac_n:
        logger.warning("RANSAC: fewer points (%d) than ransac_n (%d); returning all as non-ground.", n, ransac_n)
        return points.copy(), np.empty((0, points.shape[1]))

    xyz = points[:, :3]

    best_inlier_count = 0
    best_plane = None  # (a, b, c, d)

    for _ in range(num_iterations):
        # Step 1a: Randomly sample 3 points.
        indices = np.random.choice(n, size=ransac_n, replace=False)
        p1, p2, p3 = xyz[indices[0]], xyz[indices[1]], xyz[indices[2]]

        # Step 1b: Compute two edge vectors lying on the plane.
        v1 = p2 - p1  # vector from p1 to p2
        v2 = p3 - p1  # vector from p1 to p3

        # Normal vector via cross product: n = v1 x v2
        normal = np.cross(v1, v2)

        # Degenerate case: collinear points produce a zero-length normal.
        norm_len = np.linalg.norm(normal)
        if norm_len < 1e-10:
            continue

        # Normalize to unit normal (a, b, c).
        normal = normal / norm_len
        a, b, c = normal

        # d = -normal . p1  (so that a*p1x + b*p1y + c*p1z + d = 0)
        d = -np.dot(normal, p1)

        # Step 1c: Compute distance from ALL points to the candidate plane.
        # Since the normal is already unit-length, denominator = 1.
        #   dist_i = |a*xi + b*yi + c*zi + d|
        dists = np.abs(xyz @ normal + d)

        # Step 1d: Count inliers.
        inlier_count = np.sum(dists < distance_threshold)

        # Step 1e: Keep the best model.
        if inlier_count > best_inlier_count:
            best_inlier_count = inlier_count
            best_plane = (a, b, c, d)

    if best_plane is None:
        logger.warning("RANSAC: could not fit a plane; returning all as non-ground.")
        return points.copy(), np.empty((0, points.shape[1]))

    # Step 2: Final classification using the best plane model.
    a, b, c, d = best_plane
    normal = np.array([a, b, c])
    final_dists = np.abs(xyz @ normal + d)
    ground_mask = final_dists < distance_threshold

    non_ground_points = points[~ground_mask]
    ground_points = points[ground_mask]

    logger.info(
        "RANSAC: ground %d / %d points (%.1f%%) — plane [%.4f, %.4f, %.4f, %.4f]",
        ground_mask.sum(), n, 100.0 * ground_mask.sum() / n, a, b, c, d,
    )

    return non_ground_points, ground_points


def dbscan_cluster(points, eps=0.5, min_samples=10):
    """Cluster a point cloud using DBSCAN (implemented from scratch).

    DBSCAN classifies every point into one of three roles:

    - **Core point**: has >= min_samples neighbors within radius eps.
    - **Border point**: within eps of a core point but is not itself core.
    - **Noise point**: neither core nor within eps of any core point.

    Clusters are formed by connecting core points that are within eps of
    each other (density-reachability), and border points are assigned to
    the cluster of the first core point that reaches them.

    Algorithm:
        1. Build a KDTree; query radius neighbors for every point.
        2. Identify core points (neighbor count >= min_samples).
        3. BFS expansion: for each unvisited core point, start a new
           cluster and flood-fill through density-reachable core points,
           absorbing border points along the way.

    Parameters
    ----------
    points : np.ndarray, shape (N, C)
        Point cloud (first 3 columns are X, Y, Z).
    eps : float
        Neighborhood radius.
    min_samples : int
        Minimum neighbors (including self) to qualify as a core point.

    Returns
    -------
    labels : np.ndarray, shape (N,), dtype int
        Cluster label for each point. -1 means noise.

    Complexity
    ----------
    O(N * log(N)) when using a KDTree for radius queries (amortized),
    assuming bounded neighborhood density. In the worst case (all points
    within eps of each other), query cost degrades to O(N^2).
    """
    n = points.shape[0]
    if n == 0:
        return np.array([], dtype=int)

    xyz = points[:, :3]

    # Step 1: Build KDTree and query radius neighbors for every point.
    tree = KDTree(xyz)
    neighborhoods = tree.query_radius(xyz, r=eps)
    # neighborhoods is a list of arrays; neighborhoods[i] contains the
    # indices of all points within eps of point i (including i itself).

    # Step 2: Identify core points — those with at least min_samples neighbors.
    is_core = np.array([len(nbrs) >= min_samples for nbrs in neighborhoods], dtype=bool)

    # Step 3: Initialize all labels to -1 (noise).
    labels = np.full(n, -1, dtype=int)

    # Track which points have been visited during BFS to avoid revisiting.
    visited = np.zeros(n, dtype=bool)

    cluster_id = 0  # next cluster label to assign

    # Step 4: BFS cluster expansion.
    for i in range(n):
        # Only start a new cluster from an unvisited core point.
        if visited[i] or not is_core[i]:
            continue

        # Begin a new cluster rooted at point i.
        queue = deque()
        queue.append(i)
        visited[i] = True
        labels[i] = cluster_id

        while queue:
            current = queue.popleft()

            # Iterate over all neighbors of the current point.
            for neighbor in neighborhoods[current]:
                if labels[neighbor] == -1:
                    # Neighbor was noise or unlabeled — absorb into cluster.
                    labels[neighbor] = cluster_id

                if not visited[neighbor]:
                    visited[neighbor] = True
                    # If this neighbor is also a core point, continue
                    # expanding the cluster through it.
                    if is_core[neighbor]:
                        queue.append(neighbor)

        cluster_id += 1

    num_clusters = cluster_id
    noise_count = np.sum(labels == -1)
    logger.info(
        "DBSCAN: %d clusters, %d noise points out of %d (eps=%.3f, min_samples=%d)",
        num_clusters, noise_count, n, eps, min_samples,
    )

    return labels


def extract_features(cluster_points):
    """Extract geometric and radiometric features from a single cluster.

    Geometric features are derived via PCA on the XYZ coordinates:

        Covariance matrix C = (1/N) * (X - mu)^T (X - mu)

    Eigendecomposition of C yields eigenvalues lambda_1 >= lambda_2 >= lambda_3
    and corresponding eigenvectors e1, e2, e3.

    Shape descriptors:
        sphericity = lambda_3 / lambda_1   (1 = perfect sphere)
        planarity  = (lambda_2 - lambda_3) / lambda_1  (high = planar)
        linearity  = (lambda_1 - lambda_2) / lambda_1  (high = elongated)

    Oriented Bounding Box (OBB) volume:
        Project points onto eigenvectors, measure range along each axis,
        volume = range_1 * range_2 * range_3.

    Radiometric features (if available, columns 3+ assumed to be
    intensity, R, G, B or similar):
        mean_intensity, std_intensity, mean_r, mean_g, mean_b

    Parameters
    ----------
    cluster_points : np.ndarray, shape (M, C)
        Points belonging to one cluster. First 3 columns are XYZ.
        Column 3 = intensity (optional), columns 4-6 = R, G, B (optional).

    Returns
    -------
    features : dict
        Dictionary containing all extracted features.
    """
    n, cols = cluster_points.shape
    xyz = cluster_points[:, :3]

    features = {}

    # --- Geometric features via PCA ---

    # Centroid
    centroid = xyz.mean(axis=0)

    # Height: range of Z values
    features["height"] = float(xyz[:, 2].max() - xyz[:, 2].min())

    # Point density: number of points divided by the convex hull proxy (OBB volume).
    # We compute OBB volume below and fill density afterwards.
    features["num_points"] = n

    if n < 3:
        # Too few points for meaningful PCA; return safe defaults.
        features["obb_volume"] = 0.0
        features["sphericity"] = 0.0
        features["planarity"] = 0.0
        features["linearity"] = 0.0
        features["point_density"] = 0.0
        features["mean_intensity"] = 0.0
        features["std_intensity"] = 0.0
        features["mean_r"] = 0.0
        features["mean_g"] = 0.0
        features["mean_b"] = 0.0
        return features

    # Covariance matrix of XYZ (3x3).
    centered = xyz - centroid  # (M, 3)
    cov = (centered.T @ centered) / n  # (3, 3)

    # Eigendecomposition — np.linalg.eigh returns eigenvalues in ascending order.
    eigenvalues, eigenvectors = np.linalg.eigh(cov)

    # Sort eigenvalues descending: lambda_1 >= lambda_2 >= lambda_3
    sort_idx = np.argsort(eigenvalues)[::-1]
    eigenvalues = eigenvalues[sort_idx]
    eigenvectors = eigenvectors[:, sort_idx]  # columns are eigenvectors

    # Clamp eigenvalues to non-negative (numerical noise can produce tiny negatives).
    eigenvalues = np.maximum(eigenvalues, 0.0)
    lam1, lam2, lam3 = eigenvalues

    # --- OBB volume ---
    # Project centered points onto the eigenvector basis.
    projected = centered @ eigenvectors  # (M, 3)
    ranges = projected.max(axis=0) - projected.min(axis=0)  # range along each axis
    obb_volume = float(ranges[0] * ranges[1] * ranges[2])
    features["obb_volume"] = obb_volume

    # Point density (points per unit volume).
    features["point_density"] = float(n / obb_volume) if obb_volume > 1e-12 else 0.0

    # --- Shape descriptors ---
    if lam1 > 1e-12:
        features["sphericity"] = float(lam3 / lam1)
        features["planarity"] = float((lam2 - lam3) / lam1)
        features["linearity"] = float((lam1 - lam2) / lam1)
    else:
        # All eigenvalues near zero — degenerate cluster (all points coincident).
        features["sphericity"] = 0.0
        features["planarity"] = 0.0
        features["linearity"] = 0.0

    # --- Radiometric features ---
    # Column layout assumption: 0-2 = XYZ, 3 = intensity, 4-6 = R, G, B
    if cols > 3:
        intensity = cluster_points[:, 3]
        features["mean_intensity"] = float(intensity.mean())
        features["std_intensity"] = float(intensity.std())
    else:
        features["mean_intensity"] = 0.0
        features["std_intensity"] = 0.0

    if cols > 6:
        features["mean_r"] = float(cluster_points[:, 4].mean())
        features["mean_g"] = float(cluster_points[:, 5].mean())
        features["mean_b"] = float(cluster_points[:, 6].mean())
    else:
        features["mean_r"] = 0.0
        features["mean_g"] = 0.0
        features["mean_b"] = 0.0

    return features


def process_point_cloud(points):
    """Run the full LiDAR processing pipeline.

    Steps:
        1. Statistical Outlier Removal (SOR)
        2. RANSAC ground plane removal
        3. DBSCAN clustering
        4. PCA-based feature extraction for each sufficiently large cluster

    Parameters
    ----------
    points : np.ndarray, shape (N, C)
        Raw point cloud. First 3 columns must be X, Y, Z.

    Returns
    -------
    results : list[dict]
        One entry per valid cluster (>= 15 points), each containing:
            - cluster_id : int
            - features   : dict (from extract_features)
            - centroid   : np.ndarray, shape (3,)
            - points     : np.ndarray, shape (M, C)
    """
    original_count = points.shape[0]
    logger.info("Pipeline start: %d points", original_count)

    # Step 1: Statistical outlier removal.
    clean_points, outlier_mask = statistical_outlier_removal(points)
    removed_pct = 100.0 * outlier_mask.sum() / original_count if original_count > 0 else 0.0
    logger.info("After SOR: %d points (%.1f%% removed)", clean_points.shape[0], removed_pct)

    # Step 2: RANSAC ground plane removal.
    non_ground, ground = remove_ground_plane(clean_points)
    ground_pct = 100.0 * ground.shape[0] / clean_points.shape[0] if clean_points.shape[0] > 0 else 0.0
    logger.info("After ground removal: %d non-ground points (%.1f%% ground)", non_ground.shape[0], ground_pct)

    # Step 3: DBSCAN clustering on non-ground points.
    labels = dbscan_cluster(non_ground)
    unique_labels = set(labels)
    unique_labels.discard(-1)  # remove noise label
    logger.info("DBSCAN produced %d clusters", len(unique_labels))

    # Step 4: Feature extraction for clusters with >= 15 points.
    min_cluster_size = 15
    results = []

    for cluster_id in sorted(unique_labels):
        cluster_mask = labels == cluster_id
        cluster_pts = non_ground[cluster_mask]

        if cluster_pts.shape[0] < min_cluster_size:
            logger.debug("Cluster %d skipped: only %d points", cluster_id, cluster_pts.shape[0])
            continue

        features = extract_features(cluster_pts)
        centroid = cluster_pts[:, :3].mean(axis=0)

        results.append({
            "cluster_id": int(cluster_id),
            "features": features,
            "centroid": centroid,
            "points": cluster_pts,
        })

    logger.info(
        "Pipeline complete: %d clusters with >= %d points",
        len(results), min_cluster_size,
    )

    return results
