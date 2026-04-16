import numpy as np
import pytest
from backend.pipeline.lidar_pipeline import dbscan_cluster

def test_dbscan_finds_clusters():
    """DBSCAN should find two distinct clusters."""
    rng = np.random.default_rng(42)
    # Two well-separated clusters
    cluster1 = np.column_stack([rng.normal([0, 0, 0], 0.3, (50, 3)), rng.normal(0, 0.3, (50, 4))])
    cluster2 = np.column_stack([rng.normal([10, 10, 0], 0.3, (50, 3)), rng.normal(0, 0.3, (50, 4))])
    # Some noise far away
    noise = rng.uniform(-20, 20, (5, 7))
    points = np.vstack([cluster1, cluster2, noise])

    labels = dbscan_cluster(points, eps=1.0, min_samples=5)

    unique = set(labels) - {-1}
    assert len(unique) >= 2  # at least 2 clusters found

def test_dbscan_noise_labeling():
    """Sparse random points should mostly be noise."""
    rng = np.random.default_rng(42)
    points = rng.uniform(0, 1000, (30, 7))  # very sparse
    labels = dbscan_cluster(points, eps=0.5, min_samples=10)
    # Most should be noise (-1) since points are too spread out
    assert (labels == -1).sum() >= 20

def test_dbscan_label_shape():
    """Labels array should match input length."""
    rng = np.random.default_rng(42)
    points = rng.normal(0, 1, (100, 7))
    labels = dbscan_cluster(points, eps=1.0, min_samples=5)
    assert len(labels) == 100
