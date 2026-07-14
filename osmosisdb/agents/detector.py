"""Drift Detector Agent — detects workload drift and triggers optimization planning."""

from __future__ import annotations

import logging
import time
from osmosisdb.config import Settings
from osmosisdb.storage.sqlite import QueryStore
from osmosisdb.intelligence.drift import calculate_drift

logger = logging.getLogger(__name__)


class DriftDetectorAgent:
    """Agent that checks current workload clusters against old baseline to detect drift."""

    def __init__(self, settings: Settings, store: QueryStore) -> None:
        self.settings = settings
        self.store = store

    def run_cycle(self, new_clusters: list[dict], old_clusters: list[dict]) -> float:
        """Run drift detection cycle.

        Compares centroids, computes drift score, saves snapshot to database,
        and triggers optimization planning if threshold is exceeded.
        """
        logger.info("Starting drift detection cycle...")
        if not new_clusters:
            logger.info("No new clusters to compare. Skipping drift detection.")
            return 0.0

        new_centroids = [c["centroid_embedding"] for c in new_clusters if c.get("centroid_embedding")]
        old_centroids = [c["centroid_embedding"] for c in old_clusters if c.get("centroid_embedding")]

        if not old_centroids:
            logger.info("No historical clusters found for comparison. Saving baseline.")
            # Record initial baseline drift snapshot
            self.store.insert_drift_snapshot({
                "drift_score": 0.0,
                "emerging_patterns": 0,
                "disappearing_patterns": 0,
                "timestamp": time.time(),
            })
            return 0.0

        drift_score, emerging, disappearing = calculate_drift(
            new_centroids,
            old_centroids,
            drift_threshold=self.settings.intelligence.drift_threshold,
        )

        logger.info(
            "Drift detected: score=%.4f (threshold=%.4f), emerging=%d, disappearing=%d",
            drift_score,
            self.settings.intelligence.drift_threshold,
            emerging,
            disappearing,
        )

        # Store drift snapshot
        self.store.insert_drift_snapshot({
            "drift_score": drift_score,
            "emerging_patterns": emerging,
            "disappearing_patterns": disappearing,
            "timestamp": time.time(),
        })

        # Trigger planner if threshold exceeded
        if drift_score > self.settings.intelligence.drift_threshold:
            logger.warning(
                "Workload drift score %.4f exceeded threshold %.4f. Triggering optimization planner...",
                drift_score,
                self.settings.intelligence.drift_threshold,
            )
            self._trigger_planner()

        return drift_score

    def _trigger_planner(self) -> None:
        """Trigger the Optimization Planner Agent."""
        try:
            from osmosisdb.agents.planner import OptimizationPlannerAgent
            planner = OptimizationPlannerAgent(self.settings, self.store)
            planner.run_cycle()
        except Exception:
            logger.exception("Failed to trigger planner agent")
