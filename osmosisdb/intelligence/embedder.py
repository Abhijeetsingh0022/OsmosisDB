"""Sentence-Transformers query embedder."""

from __future__ import annotations

import logging
from sentence_transformers import SentenceTransformer

logger = logging.getLogger(__name__)

_model: SentenceTransformer | None = None


def get_embedder(model_name: str = "all-MiniLM-L6-v2") -> SentenceTransformer:
    """Return the cached SentenceTransformer instance or load a new one."""
    global _model
    if _model is None:
        logger.info("Loading sentence-transformer model: %s", model_name)
        _model = SentenceTransformer(model_name)
    return _model


def embed_queries(queries: list[str], model_name: str = "all-MiniLM-L6-v2") -> list[list[float]]:
    """Generate dense vector embeddings for a list of SQL queries."""
    if not queries:
        return []
    model = get_embedder(model_name)
    embeddings = model.encode(queries, convert_to_numpy=True)
    return embeddings.tolist()
