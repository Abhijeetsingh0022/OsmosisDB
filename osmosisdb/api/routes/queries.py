"""GET /api/queries/recent — paginated recent query log."""

from __future__ import annotations

from fastapi import APIRouter, Query, Request

router = APIRouter(tags=["queries"])


@router.get("/queries/recent")
def get_recent_queries(
    request: Request,
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
) -> list[dict]:
    """Return recent query log entries, newest first."""
    store = request.app.state.store
    return store.get_recent_queries(limit=limit, offset=offset)
