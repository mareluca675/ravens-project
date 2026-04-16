"""
FastAPI router for trajectory prediction endpoints.
"""

import json
import logging

from fastapi import APIRouter, Depends, Query
from sqlalchemy.ext.asyncio import AsyncSession

from backend.database.crud import get_session, add_trajectory_prediction, get_trajectory_predictions

try:
    from backend.pipeline.prediction_engine import predict_trajectory
except ImportError:
    predict_trajectory = None
    logging.getLogger(__name__).warning("prediction_engine not available")

logger = logging.getLogger(__name__)

router = APIRouter(prefix="/api", tags=["prediction"])


@router.post("/prediction/trajectory")
async def predict(
    lat: float = Query(46.77),
    lon: float = Query(23.59),
    session: AsyncSession = Depends(get_session),
):
    """Predict pollutant trajectory from given point."""
    if predict_trajectory is None:
        return {"error": "Prediction engine module not available"}

    result = predict_trajectory(lat, lon)

    # Build kwargs for DB storage
    kwargs = {
        "origin_lat": lat,
        "origin_lon": lon,
    }
    for hour in [1, 6, 12, 24]:
        key = f"hour_{hour}"
        if key in result and isinstance(result[key], dict):
            feature = result[key].get("geojson_feature")
            if feature is not None:
                kwargs[f"hour_{hour}_geojson"] = json.dumps(feature)
            else:
                # Store the snapshot metadata (without grid)
                kwargs[f"hour_{hour}_geojson"] = json.dumps(result[key])

    prediction = await add_trajectory_prediction(session, **kwargs)

    return {
        "prediction_id": prediction.id,
        "origin": {"lat": lat, "lon": lon},
        "trajectory": result,
    }


@router.get("/prediction/trajectories")
async def list_predictions(
    limit: int = Query(100, le=500),
    session: AsyncSession = Depends(get_session),
):
    """Return recent predictions from DB."""
    predictions = await get_trajectory_predictions(session, limit=limit)
    return {
        "count": len(predictions),
        "predictions": [
            {
                "id": p.id,
                "origin_lat": p.origin_lat,
                "origin_lon": p.origin_lon,
                "timestamp": str(p.timestamp),
                "discharge_at_prediction": p.discharge_at_prediction,
            }
            for p in predictions
        ],
    }
