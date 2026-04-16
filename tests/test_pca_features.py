import numpy as np
import pytest
from backend.pipeline.lidar_pipeline import extract_features

def test_extract_features_basic():
    """Feature extraction should return expected keys."""
    rng = np.random.default_rng(42)
    # Flat disk-like cluster (high planarity)
    points = np.column_stack([
        rng.normal(0, 2, 100),
        rng.normal(0, 2, 100),
        rng.normal(0, 0.05, 100),
        rng.uniform(40, 80, 100),  # intensity
        np.full(100, 150.0),  # r
        np.full(100, 120.0),  # g
        np.full(100, 90.0),   # b
    ])
    features = extract_features(points)

    expected_keys = [
        "height", "obb_volume", "point_density", "sphericity",
        "planarity", "linearity", "mean_intensity", "std_intensity",
        "mean_r", "mean_g", "mean_b"
    ]
    for key in expected_keys:
        assert key in features, f"Missing key: {key}"

    # Flat cluster should have relatively high planarity
    assert features["planarity"] > features["sphericity"]

def test_extract_features_spherical():
    """Spherical cluster should have high sphericity."""
    rng = np.random.default_rng(42)
    points = np.column_stack([
        rng.normal(0, 1, 100),
        rng.normal(0, 1, 100),
        rng.normal(0, 1, 100),
        np.full(100, 60.0),
        np.full(100, 160.0),
        np.full(100, 160.0),
        np.full(100, 160.0),
    ])
    features = extract_features(points)
    # Should have sphericity close to 1 (isotropic distribution)
    assert features["sphericity"] > 0.5
