"""Server-Sent Events (SSE) live stream router."""

from __future__ import annotations

import asyncio
import json
import logging
from typing import AsyncGenerator
from fastapi import APIRouter, Request
from sse_starlette.sse import EventSourceResponse

logger = logging.getLogger(__name__)

router = APIRouter(tags=["stream"])

# Global set of active connection queues
_listeners: set[asyncio.Queue] = set()


async def broadcast_event(event_type: str, data: dict) -> None:
    """Broadcast an event to all active SSE subscribers."""
    if not _listeners:
        return
    msg = {"event": event_type, "data": data}
    for q in _listeners:
        await q.put(msg)


@router.get("/stream/live")
async def live_stream(request: Request) -> EventSourceResponse:
    """Establish a real-time SSE stream connection for the dashboard."""

    async def event_generator() -> AsyncGenerator[dict, None]:
        q: asyncio.Queue = asyncio.Queue()
        _listeners.add(q)
        logger.info("New SSE client subscribed. Total: %d", len(_listeners))
        try:
            while True:
                # Disconnect check
                if await request.is_disconnected():
                    break
                try:
                    # Wait for an event with a timeout to send keep-alive pings
                    msg = await asyncio.wait_for(q.get(), timeout=15.0)
                    yield {
                        "event": msg["event"],
                        "data": json.dumps(msg["data"]),
                    }
                except asyncio.TimeoutError:
                    # Keep-alive ping
                    yield {"event": "ping", "data": ""}
        finally:
            _listeners.remove(q)
            logger.info("SSE client disconnected. Total: %d", len(_listeners))

    return EventSourceResponse(event_generator())
