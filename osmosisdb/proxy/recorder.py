"""Async query recorder — drains the proxy queue and writes to SQLite in batches."""

from __future__ import annotations

import asyncio
import logging
import time
from dataclasses import dataclass, field

from osmosisdb.agents.observer import QueryObserverAgent
from osmosisdb.storage.sqlite import QueryStore

logger = logging.getLogger(__name__)

BATCH_SIZE = 100
FLUSH_INTERVAL = 0.5  # seconds


@dataclass(slots=True)
class QueryEvent:
    """Raw query event from the proxy."""

    sql: str
    timestamp: float = field(default_factory=time.time)
    latency_ms: float = 0.0
    client_addr: str = ""


class Recorder:
    """Consumes QueryEvents from an asyncio.Queue and writes them to SQLite in batches."""

    def __init__(self, queue: asyncio.Queue[QueryEvent], store: QueryStore) -> None:
        self._queue = queue
        self._store = store
        self._observer = QueryObserverAgent()

    async def run(self) -> None:
        """Run the recorder loop. Call as a background task."""
        batch: list[QueryEvent] = []
        while True:
            try:
                # Wait for first event or flush interval
                try:
                    event = await asyncio.wait_for(self._queue.get(), timeout=FLUSH_INTERVAL)
                    batch.append(event)
                except asyncio.TimeoutError:
                    pass

                # Drain queue up to BATCH_SIZE
                while len(batch) < BATCH_SIZE:
                    try:
                        event = self._queue.get_nowait()
                        batch.append(event)
                    except asyncio.QueueEmpty:
                        break

                if batch:
                    await self._flush(batch)
                    batch = []

            except Exception:
                logger.exception("Recorder error")
                batch = []
                await asyncio.sleep(1)

    async def _flush(self, batch: list[QueryEvent]) -> None:
        """Parse metadata and write a batch of query events to SQLite."""
        rows = []
        for event in batch:
            obs = self._observer.observe(event.sql)
            if obs is not None:
                obs["latency_ms"] = event.latency_ms
                obs["timestamp"] = event.timestamp
                obs["client_addr"] = event.client_addr
                rows.append(obs)
        
        if not rows:
            return

        # Run blocking SQLite writes in a thread to keep the event loop free
        loop = asyncio.get_running_loop()
        await loop.run_in_executor(None, self._store.insert_queries, rows)
        logger.debug("Flushed %d queries to SQLite", len(rows))

        # Broadcast query flush event to SSE (fire-and-forget)
        from osmosisdb.api.routes.stream import broadcast_event
        task = asyncio.create_task(broadcast_event("query_flushed", {"count": len(rows), "recent": rows[0]}))
        task.add_done_callback(lambda t: t.exception() if not t.cancelled() and t.exception() else None)
