"""
FastAPI router for waste detection endpoints.
"""

import logging
import io
import math
import random
import time

import numpy as np
from fastapi import APIRouter, Depends, UploadFile, File, Query, HTTPException
from fastapi.responses import Response
from sqlalchemy.ext.asyncio import AsyncSession

MAX_UPLOAD_BYTES = 50 * 1024 * 1024  # 50 MB
ALLOWED_EXTS = {"las", "laz", "xyz", "csv", "txt"}

# Geographic origins anchored on real Romanian river locations. Each demo run
# picks one at random so detections appear spread across the country rather
# than piled on a single coordinate.
ROMANIAN_RIVER_ORIGINS = [
    (46.7700, 23.5900, "Someș — Cluj-Napoca"),
    (46.5350, 24.5580, "Mureș — Târgu Mureș"),
    (45.8030, 24.1530, "Olt — Sibiu"),
    (46.5670, 26.9120, "Siret — Bacău"),
    (47.7930, 22.8790, "Someș — Satu Mare"),
    (45.4350, 28.0500, "Dunăre — Galați"),
    (44.9500, 26.0250, "Prahova — Ploiești"),
    (46.9330, 26.3700, "Bistrița — Piatra Neamț"),
    (45.7540, 21.2260, "Bega — Timișoara"),
    (44.4330, 26.1020, "Dâmbovița — București"),
]

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


def _parse_text_point_cloud(content: bytes, ext: str) -> np.ndarray:
    """Parse a .xyz/.csv/.txt point cloud into an (N, >=3) numpy array.

    Accepts space- or comma-separated rows. Skips a header row if its first
    token is non-numeric. Ignores malformed lines.
    """
    text = content.decode("utf-8", errors="ignore")
    lines = [ln for ln in text.splitlines() if ln.strip()]
    if not lines:
        raise HTTPException(400, "Fișierul este gol")

    # Detect header: if first token of first line cannot be parsed as float, skip it
    def _first_token_numeric(line: str) -> bool:
        tok = line.replace(",", " ").split()
        if not tok:
            return False
        try:
            float(tok[0])
            return True
        except ValueError:
            return False

    start = 0 if _first_token_numeric(lines[0]) else 1

    rows = []
    for line in lines[start:]:
        vals = line.replace(",", " ").split()
        if len(vals) < 3:
            continue
        try:
            rows.append([float(v) for v in vals[:6]])
        except ValueError:
            continue

    if not rows:
        raise HTTPException(
            400, "Format invalid — fișierul trebuie să conțină coloane X Y Z numerice"
        )

    # Pad short rows so the returned array has consistent width
    max_cols = max(len(r) for r in rows)
    padded = [r + [0.0] * (max_cols - len(r)) for r in rows]
    return np.array(padded, dtype=np.float64)


@router.post("/lidar/process")
async def process_lidar(
    file: UploadFile = File(None),
    synthetic: bool = Query(False),
    session: AsyncSession = Depends(get_session),
):
    """Process LiDAR point cloud for waste detection.

    If synthetic=true, generate synthetic data. Otherwise read uploaded file.
    Accepts .las/.laz (binary LiDAR) or .xyz/.csv/.txt (delimited text).
    """
    t0 = time.perf_counter()

    if synthetic:
        points, _metadata = generate_synthetic_point_cloud()
        source_filename = "synthetic"
    elif file is not None:
        # Enforce 50 MB size limit
        content = await file.read()
        if len(content) > MAX_UPLOAD_BYTES:
            raise HTTPException(
                413,
                f"Fișierul depășește limita de 50 MB ({len(content) / (1024 * 1024):.1f} MB)",
            )

        ext = (file.filename or "").rsplit(".", 1)[-1].lower()
        if ext not in ALLOWED_EXTS:
            raise HTTPException(
                400,
                f"Format neacceptat: .{ext}. Formate valide: .las, .laz, .xyz, .csv, .txt",
            )

        if ext in ("las", "laz"):
            if laspy is None:
                raise HTTPException(
                    501, "laspy nu este instalat pe server; fișierele LAS nu pot fi procesate"
                )
            las = laspy.read(io.BytesIO(content))
            xyz = np.column_stack([las.x, las.y, las.z])
            cols = [xyz]
            if hasattr(las, "intensity"):
                cols.append(las.intensity.reshape(-1, 1).astype(np.float64))
            if hasattr(las, "red") and hasattr(las, "green") and hasattr(las, "blue"):
                cols.append(np.column_stack([las.red, las.green, las.blue]).astype(np.float64))
            points = np.hstack(cols)
        else:  # xyz / csv / txt
            points = _parse_text_point_cloud(content, ext)

        # Normalize coordinates so the pipeline works on local metric units
        if points.shape[0] > 0:
            points[:, :3] = points[:, :3] - points[:, :3].mean(axis=0)

        source_filename = file.filename
    else:
        raise HTTPException(400, "Trimite un fișier sau setează synthetic=true")

    # Run pipeline
    clusters = process_point_cloud(points)

    # Classify clusters if classifier is available
    if _model is not None and clusters:
        feature_dicts = [c["features"] for c in clusters]
        predictions = _classify_clusters(_model, feature_dicts)
        for c, (cat, conf) in zip(clusters, predictions):
            c["category"] = cat
            c["confidence"] = conf

    # Pick one river origin per run so detections cluster around a real river
    origin_lat, origin_lon, _origin_name = random.choice(ROMANIAN_RIVER_ORIGINS)
    lat_per_m = 1.0 / 111_000.0
    lon_per_m = 1.0 / (111_000.0 * max(math.cos(math.radians(origin_lat)), 0.1))

    # Save each detection to DB + build enriched cluster payload for the frontend
    detections = []
    cluster_payload = []
    for c in clusters:
        centroid = c["centroid"]
        lat = origin_lat + float(centroid[1]) * lat_per_m
        lon = origin_lon + float(centroid[0]) * lon_per_m
        category = c.get("category", "unknown")
        confidence = float(c.get("confidence", 0.0))
        volume = float(c["features"].get("obb_volume", 0.0))

        det = await add_waste_detection(
            session,
            latitude=lat,
            longitude=lon,
            category=category,
            confidence=confidence,
            volume=volume,
            source_file=source_filename,
        )
        detections.append(det)

        cluster_payload.append({
            "cluster_id": int(c["cluster_id"]),
            "centroid_x": float(centroid[0]),
            "centroid_y": float(centroid[1]),
            "centroid_z": float(centroid[2]),
            "centroid_lat": lat,
            "centroid_lon": lon,
            "category": category,
            "confidence": confidence,
            "volume": volume,
            "n_points": int(c["points"].shape[0]) if "points" in c else 0,
        })

    geojson = clusters_to_geojson(clusters)
    elapsed = time.perf_counter() - t0

    return {
        # Backward-compatible fields
        "num_clusters": len(clusters),
        "detections_saved": len(detections),
        "geojson": geojson,
        # New fields for the real-data visualizer
        "clusters": cluster_payload,
        "total_points": int(points.shape[0]),
        "processing_time_s": round(elapsed, 3),
        "source_filename": source_filename,
    }


@router.get("/lidar/sample")
async def download_sample_point_cloud():
    """Return a synthetic .xyz file so the demo can be run end-to-end
    without the jury needing to source their own LiDAR data.
    """
    points, _meta = generate_synthetic_point_cloud(n_waste_objects=12, area_size=150.0)
    # Keep the file small (~400 KB) by sampling down to 8000 points
    n = min(points.shape[0], 8000)
    idx = np.random.default_rng(42).choice(points.shape[0], size=n, replace=False)
    sample = points[idx]

    # Format as "X Y Z R G B\n" per line
    buf = io.StringIO()
    buf.write("# RAVENS synthetic LiDAR point cloud\n")
    buf.write("# X Y Z R G B\n")
    for row in sample:
        x, y, z = row[0], row[1], row[2]
        if row.shape[0] >= 7:
            r, g, b = int(row[4]), int(row[5]), int(row[6])
        else:
            r = g = b = 128
        buf.write(f"{x:.3f} {y:.3f} {z:.3f} {r} {g} {b}\n")

    content = buf.getvalue().encode("utf-8")
    return Response(
        content=content,
        media_type="text/plain",
        headers={
            "Content-Disposition": 'attachment; filename="ravens_sample.xyz"',
            "Content-Length": str(len(content)),
        },
    )


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
