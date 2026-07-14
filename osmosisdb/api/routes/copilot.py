"""REST API endpoints for the DBA Diagnostic Copilot chatbot."""

from __future__ import annotations

import logging
from typing import Literal
from fastapi import APIRouter, Request
from pydantic import BaseModel


from osmosisdb.config import Settings
from osmosisdb.storage.sqlite import QueryStore
from osmosisdb.optimizer.catalog import PostgresCatalog

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/copilot", tags=["copilot"])


class ChatItem(BaseModel):
    sender: Literal["user", "agent"]
    text: str


class ChatRequest(BaseModel):
    message: str
    history: list[ChatItem]


@router.post("/chat")
async def copilot_chat(req: ChatRequest, request: Request) -> dict:
    """Intelligently processes chatbot queries using LLM or local fallback context."""
    store: QueryStore = request.app.state.store
    settings: Settings = request.app.state.settings

    # 1. Gather live system telemetry
    try:
        queries = store.get_recent_queries(limit=100)
        total_queries = len(queries)
        avg_latency = sum(q["latency_ms"] for q in queries) / total_queries if total_queries > 0 else 0.0
    except Exception:
        total_queries = 0
        avg_latency = 0.0

    try:
        clusters = store.get_recent_clusters()
    except Exception:
        clusters = []

    try:
        recs = store.get_pending_recommendations()
    except Exception:
        recs = []

    # Check live DB connection status
    import psycopg
    db_status = "connected"
    try:
        with psycopg.connect(settings.postgres.dsn, connect_timeout=1):
            pass
    except Exception:
        db_status = "disconnected"

    # 2. Build local metrics fallback text
    unused_indexes = []
    if db_status == "connected":
        try:
            catalog = PostgresCatalog(settings.postgres.dsn)
            unused_indexes = [idx for idx in catalog.get_index_usage_stats() if idx["scans"] == 0]
        except Exception:
            pass

    fallback_summary = (
        f"Database Status: {db_status.upper()}\n"
        f"Proxy Port: {settings.proxy.listen_port}\n"
        f"Logged Queries: {total_queries} (Average Latency: {avg_latency:.2f}ms)\n"
        f"Workload Clusters: {len(clusters)} pattern groups\n"
        f"Pending Index Recommendations: {len(recs)} awaiting approval\n"
    )
    if unused_indexes:
        fallback_summary += f"Unused indexes detected: {len(unused_indexes)}\n"

    # 3. If LLM is configured, invoke Groq Chat
    if settings.groq.api_key:
        try:
            from langchain_groq import ChatGroq
            from langchain_core.messages import HumanMessage, SystemMessage, AIMessage

            chat = ChatGroq(
                temperature=0.3,
                model_name=settings.groq.model or "llama-3.1-8b-instant",
                api_key=settings.groq.api_key,
            )

            # Compile catalog / optimizer state for system context
            system_context = (
                f"You are the OsmosisDB DBA Diagnostic Copilot, an expert PostgreSQL DBA assistant.\n"
                f"You help developers understand database health, indexes, and queries.\n\n"
                f"Current Live System State:\n"
                f"---------------------------------\n"
                f"{fallback_summary}\n"
                f"Workload Patterns:\n"
                + "\n".join([f"- {c['label']} ({c['member_count']} queries): {c['representative_sql']}" for c in clusters[:5]])
                + "\n\nPending Optimization Recommendations:\n"
                + "\n".join([f"- {r['optimization_type']} on table: {r['ddl']} (Rationale: {r['explanation']})" for r in recs[:3]])
                + "\n---------------------------------\n"
                "Instructions:\n"
                "- Be concise, professional, and friendly.\n"
                "- Answer questions directly using the database state context provided above.\n"
                "- If asked about health, workloads, latency, or recommendations, refer to the actual stats above."
            )

            messages = [SystemMessage(content=system_context)]

            # Add recent conversation history (last 8 messages max)
            for item in req.history[-8:]:
                if item.sender == "user":
                    messages.append(HumanMessage(content=item.text))
                else:
                    messages.append(AIMessage(content=item.text))

            # Add current user prompt
            messages.append(HumanMessage(content=req.message))

            response = chat.invoke(messages)
            return {"reply": str(response.content)}

        except Exception as e:
            logger.exception("Copilot LLM chat invocation failed: %s", e)

    # 4. Local fallback response if LLM is unavailable or api key is missing
    lower = req.message.lower()
    if "health" in lower or "index" in lower:
        reply = (
            f"Here is the database health summary:\n"
            f"- Status: {db_status.upper()}\n"
            f"- Unused indexes: {len(unused_indexes)} index structures (0 scans logged).\n"
            f"Please check the Advisory Queue for DDL suggestions."
        )
    elif "latency" in lower or "queries" in lower or "slow" in lower:
        reply = (
            f"I have logged {total_queries} queries through the proxy on port {settings.proxy.listen_port}.\n"
            f"The average latency is {avg_latency:.2f}ms."
        )
    elif "drift" in lower or "workload" in lower:
        reply = (
            f"The learner has identified {len(clusters)} workload pattern clusters from your SQL traffic.\n"
            f"Check the Workloads tab for the full semantic drift timeline."
        )
    elif "optimize" in lower or "pending" in lower or "recommend" in lower:
        reply = (
            f"There are {len(recs)} pending optimization recommendations ready in the Advisory Queue."
        )
    elif "hi" in lower or "hello" in lower:
        reply = "Hello! I am your DBA Diagnostic Copilot. How can I help you optimize your database today?"
    else:
        reply = (
            f"I am monitoring your Postgres traffic on port {settings.proxy.listen_port}.\n"
            f"Current Telemetry Summary:\n{fallback_summary}"
        )

    return {"reply": reply}
