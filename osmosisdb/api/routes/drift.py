"""GET /api/drift/timeline — drift snapshot timeline endpoint."""

from __future__ import annotations

from fastapi import APIRouter, Query, Request

router = APIRouter(tags=["drift"])


@router.get("/drift/timeline")
def get_drift_timeline(
    request: Request,
    limit: int = Query(default=100, ge=1, le=1000),
) -> list[dict]:
    """Return historical drift snapshots, newest first."""
    store = request.app.state.store
    return store.get_drift_timeline(limit=limit)
