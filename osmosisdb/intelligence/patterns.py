"""Pattern clustering and labeling."""

from __future__ import annotations

import logging
import time
import numpy as np

logger = logging.getLogger(__name__)


def generate_pattern_clusters(
    queries: list[str],
    embeddings: list[list[float]],
    labels: list[int],
    centroids: list[list[float]],
    query_counts: dict[str, int] | None = None,
) -> list[dict]:
    """Generate labeled clusters from UMAP/HDBSCAN output.

    For each cluster:
      - Finds the query closest to the cluster centroid.
      - Sets it as the representative SQL / label.
      - Counts members.

    Returns:
        A list of cluster dicts matching the sqlite representation.
    """
    if not queries or not embeddings or not labels:
        return []

    unique_labels = sorted(list(set(labels)))
    if -1 in unique_labels:
        unique_labels.remove(-1)

    clusters = []
    created_at = time.time()

    # Fallback: if no clusters detected (all noise or too few queries),
    # treat each query template as its own workload category to bootstrap planner agents.
    if not unique_labels:
        for idx, q in enumerate(queries):
            label_text = f"Access Pattern {idx + 1}"
            m_count = query_counts.get(q, 1) if query_counts else 1
            clusters.append({
                "label": label_text,
                "member_count": m_count,
                "representative_sql": q,
                "centroid_embedding": embeddings[idx],
                "created_at": created_at,
            })
        return clusters

    for idx, label in enumerate(unique_labels):
        if idx >= len(centroids):
            break

        centroid = np.array(centroids[idx])

        # Get all members of this cluster
        member_indices = [i for i, lbl in enumerate(labels) if lbl == label]
        member_queries = [queries[i] for i in member_indices]
        member_embeddings = [np.array(embeddings[i]) for i in member_indices]

        # Find the query closest to the centroid (highest cosine similarity)
        best_sim = -1.0
        best_query = member_queries[0]

        centroid_norm = np.linalg.norm(centroid)
        if centroid_norm > 0:
            for q, emb in zip(member_queries, member_embeddings):
                emb_norm = np.linalg.norm(emb)
                if emb_norm > 0:
                    sim = np.dot(centroid, emb) / (centroid_norm * emb_norm)
                    if sim > best_sim:
                        best_sim = sim
                        best_query = q

        # Use normalized SQL with placeholders as the cluster label to protect data privacy
        label_text = f"Pattern {label}: {best_query[:100]}..."

        m_count = sum(query_counts.get(q, 1) for q in member_queries) if query_counts else len(member_queries)
        clusters.append({
            "label": label_text,
            "member_count": m_count,
            "representative_sql": best_query,
            "centroid_embedding": centroids[idx],
            "created_at": created_at,
        })

    return clusters
