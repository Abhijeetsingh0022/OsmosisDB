"""Transparent PostgreSQL proxy using asyncio.

Forwards PG wire protocol traffic bidirectionally while extracting SQL
queries on the frontend→backend path and pushing them into an async queue
for the recorder to process.

Neon DB compatible: startup/SSL negotiation bytes pass through untouched,
so TLS and SCRAM-SHA-256 auth work transparently.
"""

from __future__ import annotations

import asyncio
import logging

import time
from urllib.parse import urlparse

from osmosisdb.config import Settings
from osmosisdb.proxy.protocol import extract_sql, parse_message
from osmosisdb.proxy.recorder import QueryEvent, Recorder
from osmosisdb.storage.sqlite import QueryStore

logger = logging.getLogger(__name__)

# ponytail: unbounded queue — backpressure handled by batch flush in recorder
_query_queue: asyncio.Queue[QueryEvent] = asyncio.Queue()


async def _pipe(
    label: str,
    reader: asyncio.StreamReader,
    writer: asyncio.StreamWriter,
    *,
    intercept_sql: bool = False,
    client_addr: str = "",
    pending_queries: dict[str, float] | None = None,
) -> None:
    """Copy bytes from reader to writer. Optionally extract SQL on the way through."""
    try:
        while True:
            data = await reader.read(65536)
            if not data:
                break

            if intercept_sql:
                _try_extract_queries(data, client_addr, pending_queries)

            writer.write(data)
            await writer.drain()
    except (ConnectionResetError, BrokenPipeError, asyncio.CancelledError):
        pass
    finally:
        try:
            writer.close()
            await writer.wait_closed()
        except Exception:
            pass


def _try_extract_queries(
    data: bytes, client_addr: str, pending_queries: dict[str, float] | None
) -> None:
    """Best-effort SQL extraction from a chunk of PG wire data. Never blocks."""
    offset = 0
    while offset < len(data):
        msg, consumed = parse_message(data, offset)
        if msg is None:
            break
        offset += consumed

        sql = extract_sql(msg)
        if sql and sql.strip():
            ts = time.time()
            if pending_queries is not None:
                pending_queries[sql] = ts
            _query_queue.put_nowait(QueryEvent(sql=sql, timestamp=ts, client_addr=client_addr))


async def _handle_connection(
    client_reader: asyncio.StreamReader,
    client_writer: asyncio.StreamWriter,
    backend_host: str,
    backend_port: int,
) -> None:
    """Handle a single client connection by piping to the PG backend."""
    peername = client_writer.get_extra_info("peername")
    client_addr = f"{peername[0]}:{peername[1]}" if peername else "unknown"
    logger.info("New connection from %s", client_addr)

    try:
        backend_reader, backend_writer = await asyncio.open_connection(
            backend_host, backend_port
        )
    except Exception:
        logger.exception("Failed to connect to backend %s:%d", backend_host, backend_port)
        client_writer.close()
        return

    pending: dict[str, float] = {}

    await asyncio.gather(
        _pipe("client→backend", client_reader, backend_writer, intercept_sql=True, client_addr=client_addr, pending_queries=pending),
        _pipe("backend→client", backend_reader, client_writer),
    )
    logger.info("Connection closed: %s", client_addr)


async def run_proxy(settings: Settings) -> None:
    """Start the TCP proxy and the background recorder."""
    parsed = urlparse(settings.postgres.dsn)
    backend_host = parsed.hostname or "localhost"
    backend_port = parsed.port or 5432
    use_ssl = "sslmode=require" in settings.postgres.dsn or "sslmode=verify" in settings.postgres.dsn

    store = QueryStore()
    recorder = Recorder(_query_queue, store)
    recorder_task = asyncio.create_task(recorder.run())

    async def on_connect(r: asyncio.StreamReader, w: asyncio.StreamWriter) -> None:
        await _handle_connection(r, w, backend_host, backend_port)

    server = await asyncio.start_server(
        on_connect,
        host=settings.proxy.listen_host,
        port=settings.proxy.listen_port,
    )
    logger.info(
        "Proxy listening on %s:%d → %s:%d (ssl=%s)",
        settings.proxy.listen_host,
        settings.proxy.listen_port,
        backend_host,
        backend_port,
        use_ssl,
    )

    try:
        async with server:
            await server.serve_forever()
    finally:
        recorder_task.cancel()
