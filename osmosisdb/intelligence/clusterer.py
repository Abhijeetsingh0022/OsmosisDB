"""UMAP + HDBSCAN SQL query clustering pipeline."""

from __future__ import annotations

import logging
import numpy as np
import umap
import hdbscan

logger = logging.getLogger(__name__)


def cluster_embeddings(
    embeddings: list[list[float]],
    min_cluster_size: int = 5,
) -> tuple[list[int], list[list[float]]]:
    """Perform UMAP dimension reduction followed by HDBSCAN clustering.

    Returns:
        labels: List of cluster labels for each input query (-1 indicates noise)
        centroids: List of centroid embeddings (mean embedding) for each unique non-noise cluster
    """
    n_samples = len(embeddings)
    if n_samples < min_cluster_size or n_samples < 5:
        logger.debug("Too few samples to cluster: %d", n_samples)
        return [-1] * n_samples, []

    try:
        data = np.array(embeddings)

        # UMAP reduction: n_neighbors should be less than n_samples
        n_neighbors = min(15, n_samples - 1)
        n_components = min(5, data.shape[1] - 1)
        if n_components < 2:
            n_components = 2

        reducer = umap.UMAP(
            n_neighbors=n_neighbors,
            n_components=n_components,
            min_dist=0.0,
            metric="cosine",
            random_state=42,
        )
        reduced_data = reducer.fit_transform(data)

        # HDBSCAN clustering
        clusterer = hdbscan.HDBSCAN(
            min_cluster_size=min_cluster_size,
            metric="euclidean",
            cluster_selection_method="eom",
        )
        labels = clusterer.fit_predict(reduced_data).tolist()

        # Compute centroids in the ORIGINAL embedding space for non-noise clusters
        unique_labels = set(labels)
        unique_labels.discard(-1)

        centroids = []
        for label in sorted(unique_labels):
            members = [data[i] for i, lbl in enumerate(labels) if lbl == label]
            centroid = np.mean(members, axis=0).tolist()
            centroids.append(centroid)

        return labels, centroids

    except Exception:
        logger.exception("Error during embedding clustering")
        return [-1] * n_samples, []
