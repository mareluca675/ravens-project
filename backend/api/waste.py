"""
FastAPI router for waste detection endpoints.
"""

import logging
import io

import numpy as np
from fastapi import APIRouter, Depends, UploadFile, File, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.crud import get_session, add_waste_detection, get_waste_detections
from backend.pipeline.lidar_pipeline import process_point_cloud
from backend.utils.synthetic_data import generate_synthetic_point_cloud
from backend.utils.visualizer import clusters_to_geojson

try:
    from backend.models.lidar_classifier import (
        WasteFeatureClassifier, classify_clusters as _classify_clusters,
        generate_training_data, train_classifier, CATEGORIES,
    )
    # Train a lightweight classifier on synthetic data at import time
    _model = WasteFeatureClassifier()
    _features, _labels = generate_training_data(n_samples=600)
    train_classifier(_model, _features, _labels, epochs=30, lr=0.002)
    _model.eval()
except Exception:
    _model = None
    logging.getLogger(__name__).warning("lidar_classifier not available; classification disabled")

try:
    import laspy
except ImportError:
    laspy = None
    logging.getLogger(__name__).warning("laspy not available; LAS file upload disabled")

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["waste"])


@router.post("/lidar/process")
async def process_lidar(
    file: UploadFile = File(None),
    synthetic: bool = Query(False),
    session: AsyncSession = Depends(get_session),
):
    """Process LiDAR point cloud for waste detection.

    If synthetic=true, generate synthetic data. Otherwise read uploaded LAS file.
    """
    if synthetic:
        points, metadata = generate_synthetic_point_cloud()
    elif file is not None:
        if laspy is None:
            return {"error": "laspy is not installed; cannot read LAS files"}
        content = await file.read()
        las = laspy.read(io.BytesIO(content))
        xyz = np.column_stack([las.x, las.y, las.z])
        # Append intensity and RGB if available
        cols = [xyz]
        if hasattr(las, "intensity"):
            cols.append(las.intensity.reshape(-1, 1).astype(np.float64))
        if hasattr(las, "red") and hasattr(las, "green") and hasattr(las, "blue"):
            cols.append(np.column_stack([las.red, las.green, las.blue]).astype(np.float64))
        points = np.hstack(cols)
        metadata = None
    else:
        return {"error": "Provide a LAS file or set synthetic=true"}

    # Run pipeline
    clusters = process_point_cloud(points)

    # Classify clusters if classifier is available
    if _model is not None:
        feature_dicts = [c["features"] for c in clusters]
        predictions = _classify_clusters(_model, feature_dicts)
        for c, (cat, conf) in zip(clusters, predictions):
            c["category"] = cat
            c["confidence"] = conf

    # Save each detection to DB
    detections = []
    for c in clusters:
        centroid = c["centroid"]
        lat = 46.77 + centroid[1] / 111000.0
        lon = 23.59 + centroid[0] / 78000.0
        category = c.get("category", "unknown")
        confidence = c.get("confidence", 0.0)
        volume = c["features"].get("obb_volume", 0.0)

        det = await add_waste_detection(
            session,
            latitude=lat,
            longitude=lon,
            category=category,
            confidence=confidence,
            volume=volume,
            source_file=file.filename if file else "synthetic",
        )
        detections.append(det)

    geojson = clusters_to_geojson(clusters)

    return {
        "num_clusters": len(clusters),
        "detections_saved": len(detections),
        "geojson": geojson,
    }


@router.get("/waste/detections")
async def list_detections(
    limit: int = Query(100, le=500),
    session: AsyncSession = Depends(get_session),
):
    """Return recent waste detections from DB as JSON."""
    detections = await get_waste_detections(session, limit=limit)
    return {
        "count": len(detections),
        "detections": [
            {
                "id": d.id,
                "latitude": d.latitude,
                "longitude": d.longitude,
                "category": d.category,
                "confidence": d.confidence,
                "volume": d.volume,
                "timestamp": str(d.timestamp),
            }
            for d in detections
        ],
    }
