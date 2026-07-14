"""Pattern Learner Agent — learns access patterns by clustering queries."""

from __future__ import annotations

import logging
import time
from osmosisdb.config import Settings
from osmosisdb.storage.sqlite import QueryStore
from osmosisdb.intelligence.embedder import embed_queries
from osmosisdb.intelligence.clusterer import cluster_embeddings
from osmosisdb.intelligence.patterns import generate_pattern_clusters

logger = logging.getLogger(__name__)


class PatternLearnerAgent:
    """Agent that runs periodically to discover workload patterns via clustering."""

    def __init__(self, settings: Settings, store: QueryStore) -> None:
        self.settings = settings
        self.store = store

    def run_cycle(self) -> list[dict]:
        """Execute one pattern learning cycle.

        Reads queries from the last hour, embeds them, clusters them,
        and saves the discovered clusters to the database.
        """
        logger.info("Starting pattern learning cycle...")
        # Read queries from the last 1 hour (3600s) to get a stable signature
        window_start = time.time() - 3600
        queries_raw = self.store.get_queries_since(window_start)

        if not queries_raw:
            logger.info("No queries found in the last hour. Skipping pattern learning.")
            return []

        # Group raw queries by fingerprint, choosing the first SQL as representative
        fp_to_sql = {}
        fp_counts = {}
        for q in queries_raw:
            fp = q["fingerprint"]
            if not fp:
                continue
            if fp not in fp_to_sql:
                fp_to_sql[fp] = q["sql"]
            fp_counts[fp] = fp_counts.get(fp, 0) + 1

        fp_list = list(fp_to_sql.keys())
        sql_list = [fp_to_sql[fp] for fp in fp_list]
        n_queries = len(fp_list)

        min_queries = self.settings.intelligence.min_queries_for_clustering
        logger.info("Embedding and analyzing %d unique query templates...", n_queries)
        try:
            embeddings = embed_queries(sql_list, model_name=self.settings.embedding.model)
            
            if n_queries < min_queries:
                logger.info("Low unique query template count (%d < %d). Bypassing UMAP/HDBSCAN and generating template workloads directly.", n_queries, min_queries)
                labels = [-1] * n_queries
                centroids = []
            else:
                labels, centroids = cluster_embeddings(embeddings)

            # Match queries to counts in the actual window
            query_counts = {fp_to_sql[fp]: count for fp, count in fp_counts.items()}

            clusters = generate_pattern_clusters(sql_list, embeddings, labels, centroids, query_counts=query_counts)

            if clusters:
                self.store.insert_pattern_clusters(clusters)
                logger.info("Successfully identified and stored %d pattern clusters.", len(clusters))
            else:
                logger.info("No dense clusters identified in the current workload.")

            return clusters

        except Exception:
            logger.exception("Failed pattern learning cycle")
            return []
