"""HSV-based optical substance classifier."""


def classify_substance(image_patch):
    """Wrapper that delegates to fusion_engine.classify_substance_optical."""
    from backend.pipeline.fusion_engine import classify_substance_optical

    return classify_substance_optical(image_patch)
