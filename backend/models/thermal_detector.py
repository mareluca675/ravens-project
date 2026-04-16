"""Simple threshold-based thermal detector with configurable parameters."""


def detect_thermal_hotspots(thermal_matrix, threshold_dt=3.0):
    """Wrapper that delegates to fusion_engine.detect_thermal_anomalies."""
    from backend.pipeline.fusion_engine import detect_thermal_anomalies

    return detect_thermal_anomalies(thermal_matrix, threshold_dt=threshold_dt)
