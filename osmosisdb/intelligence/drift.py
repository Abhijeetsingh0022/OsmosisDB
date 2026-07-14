"""Workload drift detection comparing current and historical cluster centroids."""

from __future__ import annotations

import logging
import numpy as np

logger = logging.getLogger(__name__)


def calculate_drift(
    new_centroids: list[list[float]],
    old_centroids: list[list[float]],
    drift_threshold: float = 0.3,
) -> tuple[float, int, int]:
    """Calculate the drift score and count emerging/disappearing patterns.

    Args:
        new_centroids: Centroids from the current query window.
        old_centroids: Centroids from a historical reference window.
        drift_threshold: Distance threshold (1 - similarity) to classify as new/gone.

    Returns:
        drift_score: Normalized score [0.0 - 1.0].
        emerging_patterns: Count of new patterns not matching historical ones.
        disappearing_patterns: Count of old patterns no longer present.
    """
    if not new_centroids:
        return 0.0, 0, 0

    if not old_centroids:
        # Initial run: no historical data to compare against
        return 0.0, 0, 0

    new_arr = np.array(new_centroids)
    old_arr = np.array(old_centroids)

    # Normalize vectors for cosine similarity
    new_norms = np.linalg.norm(new_arr, axis=1, keepdims=True)
    old_norms = np.linalg.norm(old_arr, axis=1, keepdims=True)

    # Avoid divide by zero
    new_norms[new_norms == 0] = 1.0
    old_norms[old_norms == 0] = 1.0

    new_normalized = new_arr / new_norms
    old_normalized = old_arr / old_norms

    # Cosine similarity matrix: shape (len(new), len(old))
    sim_matrix = np.dot(new_normalized, old_normalized.T)

    # Max similarity for each new cluster (to any old cluster)
    max_sim_new = np.max(sim_matrix, axis=1)
    # Cosine distance (1 - similarity)
    dist_new = 1.0 - max_sim_new

    # Emerging: new clusters whose closest match in historical is further than threshold
    emerging_patterns = int(np.sum(dist_new > drift_threshold))

    # Max similarity for each old cluster (to any new cluster)
    max_sim_old = np.max(sim_matrix, axis=0)
    dist_old = 1.0 - max_sim_old

    # Disappearing: old clusters whose closest match in recent is further than threshold
    disappearing_patterns = int(np.sum(dist_old > drift_threshold))

    # Overall drift score is the average cosine distance of current workload to historical baseline
    drift_score = float(np.mean(dist_new))

    return drift_score, emerging_patterns, disappearing_patterns
