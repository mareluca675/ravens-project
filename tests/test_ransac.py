import numpy as np
import pytest
from backend.pipeline.lidar_pipeline import remove_ground_plane

def test_ransac_separates_ground():
    """RANSAC should separate a flat ground from elevated objects."""
    rng = np.random.default_rng(42)
    # Ground plane at z=0 with slight noise
    n_ground = 500
    ground = np.column_stack([
        rng.uniform(0, 10, n_ground),
        rng.uniform(0, 10, n_ground),
        rng.normal(0, 0.05, n_ground),
        np.zeros((n_ground, 4))  # intensity, r, g, b
    ])
    # Elevated objects at z=2
    n_above = 100
    above = np.column_stack([
        rng.uniform(3, 7, n_above),
        rng.uniform(3, 7, n_above),
        rng.normal(2, 0.1, n_above),
        np.zeros((n_above, 4))
    ])
    points = np.vstack([ground, above])

    non_ground, ground_pts = remove_ground_plane(points, distance_threshold=0.2, num_iterations=500)

    # Most ground points should be classified as ground
    assert len(ground_pts) > 300
    # Most above-ground points should be in non_ground
    assert len(non_ground) > 50

def test_ransac_returns_all_points():
    """Total of ground + non_ground should equal input."""
    rng = np.random.default_rng(42)
    points = rng.normal(0, 1, (200, 7))
    non_ground, ground_pts = remove_ground_plane(points)
    assert len(non_ground) + len(ground_pts) == len(points)
