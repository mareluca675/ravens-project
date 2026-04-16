"""
GeoJSON and data conversion utilities for RAVENS map layers.
"""

import json


def waste_detections_to_geojson(detections) -> dict:
    """Convert list of WasteDetection ORM objects to GeoJSON FeatureCollection."""
    features = []
    for d in detections:
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [d.longitude, d.latitude]},
            "properties": {
                "id": d.id,
                "category": d.category,
                "confidence": d.confidence,
                "volume": d.volume,
                "timestamp": str(d.timestamp),
            },
        })
    return {"type": "FeatureCollection", "features": features}


def dumping_incidents_to_geojson(incidents) -> dict:
    """Convert list of DumpingIncident ORM objects to GeoJSON FeatureCollection."""
    features = []
    for inc in incidents:
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [inc.longitude, inc.latitude]},
            "properties": {
                "id": inc.id,
                "classification": inc.classification,
                "confidence": inc.confidence,
                "thermal_score": inc.thermal_score,
                "optical_score": inc.optical_score,
                "lidar_score": inc.lidar_score,
                "substance_type": inc.substance_type,
                "timestamp": str(inc.timestamp),
            },
        })
    return {"type": "FeatureCollection", "features": features}


def predictions_to_geojson(predictions) -> dict:
    """Convert list of TrajectoryPrediction ORM objects to GeoJSON.

    Each prediction has hour_X_geojson stored as JSON strings — parse and include.
    """
    features = []
    for p in predictions:
        # Origin point feature
        feature = {
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [p.origin_lon, p.origin_lat]},
            "properties": {
                "id": p.id,
                "timestamp": str(p.timestamp),
                "discharge_at_prediction": p.discharge_at_prediction,
                "trajectories": {},
            },
        }
        for hour in [1, 6, 12, 24]:
            raw = getattr(p, f"hour_{hour}_geojson", None)
            if raw:
                try:
                    feature["properties"]["trajectories"][f"hour_{hour}"] = json.loads(raw)
                except (json.JSONDecodeError, TypeError):
                    pass
        features.append(feature)
    return {"type": "FeatureCollection", "features": features}


def clusters_to_geojson(clusters, lat_offset=46.77, lon_offset=23.59) -> dict:
    """Convert pipeline cluster results to GeoJSON.

    clusters: list of dicts from process_point_cloud.
    Convert local XY centroids to approx lat/lon using offsets (default: Someș near Cluj).
    1 metre ≈ 1/111000 degrees lat, 1/78000 degrees lon at lat ~46.
    """
    features = []
    for c in clusters:
        centroid = c["centroid"]
        lat = lat_offset + centroid[1] / 111000.0
        lon = lon_offset + centroid[0] / 78000.0
        props = {
            "cluster_id": c["cluster_id"],
            "num_points": c["features"].get("num_points", 0),
            "volume": c["features"].get("obb_volume", 0.0),
            "height": c["features"].get("height", 0.0),
        }
        # Include classification if present
        if "category" in c:
            props["category"] = c["category"]
        if "confidence" in c:
            props["confidence"] = c["confidence"]
        features.append({
            "type": "Feature",
            "geometry": {"type": "Point", "coordinates": [lon, lat]},
            "properties": props,
        })
    return {"type": "FeatureCollection", "features": features}
