"""
FastAPI router for illegal dumping detection endpoints.
"""

import logging
import random

import numpy as np
from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

# Real Romanian river locations — one is chosen per incident so the demo map
# does not pile every dumping event on the exact same pixel.
ROMANIAN_DUMPING_SITES = [
    (46.7700, 23.5900),  # Someș — Cluj-Napoca
    (46.5350, 24.5580),  # Mureș — Târgu Mureș
    (45.8030, 24.1530),  # Olt — Sibiu
    (46.5670, 26.9120),  # Siret — Bacău
    (47.7930, 22.8790),  # Someș — Satu Mare
    (45.4350, 28.0500),  # Dunăre — Galați
    (44.9500, 26.0250),  # Prahova — Ploiești
    (46.9330, 26.3700),  # Bistrița — Piatra Neamț
    (45.7540, 21.2260),  # Bega — Timișoara
    (44.4330, 26.1020),  # Dâmbovița — București
]

from backend.database.crud import get_session, add_dumping_incident, get_dumping_incidents
from backend.utils.synthetic_data import (
    generate_synthetic_thermal_scene,
    generate_synthetic_optical_scene,
    generate_synthetic_point_cloud,
)

try:
    from backend.pipeline.fusion_engine import run_fusion_pipeline
except ImportError:
    run_fusion_pipeline = None
    logging.getLogger(__name__).warning("fusion_engine not available")

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["dumping"])


@router.post("/dumping/detect")
async def detect_dumping(
    synthetic: bool = Query(False),
    session: AsyncSession = Depends(get_session),
):
    """Run multi-sensor fusion for illegal dumping detection.

    If synthetic=true, generate all synthetic data.
    """
    if not synthetic:
        return {"error": "Only synthetic mode is currently supported"}

    if run_fusion_pipeline is None:
        return {"error": "Fusion pipeline module not available"}

    thermal = generate_synthetic_thermal_scene()
    optical = generate_synthetic_optical_scene()
    points_array, _ = generate_synthetic_point_cloud()
    lidar_points = points_array[:, :3]

    result = run_fusion_pipeline(thermal, optical, lidar_points)

    evidence = result.get("evidence", {})
    # Pick a random river location, with a small jitter so repeated demo
    # clicks on the same site don't overlap pixel-perfectly on the map.
    base_lat, base_lon = random.choice(ROMANIAN_DUMPING_SITES)
    jitter_lat = random.uniform(-0.004, 0.004)
    jitter_lon = random.uniform(-0.006, 0.006)
    incident = await add_dumping_incident(
        session,
        latitude=base_lat + jitter_lat,
        longitude=base_lon + jitter_lon,
        classification=result["classification"],
        confidence=result["confidence"],
        thermal_score=evidence.get("thermal_score"),
        optical_score=evidence.get("optical_score"),
        lidar_score=evidence.get("lidar_score"),
        substance_type=evidence.get("substance_type"),
    )

    return {
        "incident_id": incident.id,
        "classification": result["classification"],
        "confidence": result["confidence"],
        "evidence": evidence,
    }


@router.get("/dumping/incidents")
async def list_incidents(
    limit: int = Query(100, le=500),
    session: AsyncSession = Depends(get_session),
):
    """Return recent dumping incidents from DB."""
    incidents = await get_dumping_incidents(session, limit=limit)
    return {
        "count": len(incidents),
        "incidents": [
            {
                "id": inc.id,
                "latitude": inc.latitude,
                "longitude": inc.longitude,
                "classification": inc.classification,
                "confidence": inc.confidence,
                "thermal_score": inc.thermal_score,
                "optical_score": inc.optical_score,
                "lidar_score": inc.lidar_score,
                "substance_type": inc.substance_type,
                "timestamp": str(inc.timestamp),
            }
            for inc in incidents
        ],
    }
