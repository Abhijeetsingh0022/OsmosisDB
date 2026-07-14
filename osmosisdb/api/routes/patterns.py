"""GET /api/patterns/clusters — workload patterns endpoint."""

from __future__ import annotations

from fastapi import APIRouter, Request

router = APIRouter(tags=["patterns"])


@router.get("/patterns/clusters")
def get_patterns(request: Request) -> list[dict]:
    """Return the current set of discovered workload pattern clusters."""
    store = request.app.state.store
    clusters = store.get_recent_clusters()

    # Exclude raw binary embeddings from JSON response to save bandwidth
    for c in clusters:
        if "centroid_embedding" in c:
            c.pop("centroid_embedding")

    return clusters
