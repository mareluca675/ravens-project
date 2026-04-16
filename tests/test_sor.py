import numpy as np
import pytest
from backend.pipeline.lidar_pipeline import statistical_outlier_removal

def test_sor_removes_outliers():
    """SOR should remove points far from their neighbors."""
    rng = np.random.default_rng(42)
    # Create 200 tightly clustered points (ground truth: no outliers)
    clean = rng.normal(0, 1, (200, 7))
    # Add 10 extreme outliers far away
    outliers = rng.normal(50, 1, (10, 7))
    points = np.vstack([clean, outliers])

    clean_pts, mask = statistical_outlier_removal(points, k=10, std_ratio=2.0)

    # At least the extreme outliers should be flagged
    assert mask.sum() >= 5  # most outliers detected
    assert len(clean_pts) < len(points)

def test_sor_empty():
    """SOR handles empty input."""
    points = np.zeros((0, 7))
    clean_pts, mask = statistical_outlier_removal(points)
    assert len(clean_pts) == 0
    assert len(mask) == 0

def test_sor_preserves_shape():
    """Output should have same number of columns."""
    rng = np.random.default_rng(42)
    points = rng.normal(0, 1, (100, 7))
    clean_pts, mask = statistical_outlier_removal(points, k=5)
    assert clean_pts.shape[1] == 7
    assert mask.shape == (100,)
