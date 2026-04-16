"""
RAVENS FastAPI application entry point.
"""

import logging
from contextlib import asynccontextmanager

from fastapi import FastAPI, Depends
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.crud import init_db, get_session, get_all_map_data
from backend.api import waste, dumping, prediction
from backend.utils.visualizer import (
    waste_detections_to_geojson,
    dumping_incidents_to_geojson,
    predictions_to_geojson,
)

logger = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    yield


app = FastAPI(
    title="RAVENS",
    description="River AI Vision for Environmental Surveillance",
    lifespan=lifespan,
)

# CORS for React frontend
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Include routers
app.include_router(waste.router)
app.include_router(dumping.router)
app.include_router(prediction.router)


@app.get("/api/map/layers")
async def map_layers(session: AsyncSession = Depends(get_session)):
    """Return combined GeoJSON for all map layers."""
    data = await get_all_map_data(session)
    return {
        "waste": waste_detections_to_geojson(data["waste"]),
        "dumping": dumping_incidents_to_geojson(data["dumping"]),
        "predictions": predictions_to_geojson(data["predictions"]),
    }


@app.get("/api/stats/summary")
async def stats_summary(session: AsyncSession = Depends(get_session)):
    """Aggregate statistics across all data."""
    data = await get_all_map_data(session)

    # Count waste detections by category
    waste_by_category = {}
    for d in data["waste"]:
        waste_by_category[d.category] = waste_by_category.get(d.category, 0) + 1

    # Count dumping incidents by classification
    dumping_by_class = {}
    for inc in data["dumping"]:
        dumping_by_class[inc.classification] = dumping_by_class.get(inc.classification, 0) + 1

    return {
        "waste_detections": len(data["waste"]),
        "waste_by_category": waste_by_category,
        "dumping_incidents": len(data["dumping"]),
        "dumping_by_classification": dumping_by_class,
        "trajectory_predictions": len(data["predictions"]),
    }


@app.get("/health")
async def health():
    return {"status": "ok", "service": "RAVENS"}
