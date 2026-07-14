"""DDL execution engine with query plan analysis and rollback capabilities."""

from __future__ import annotations

import json
import logging
import psycopg

logger = logging.getLogger(__name__)


class OptimizationExecutor:
    """Executes DDL statements, captures query plan costs, and rolls back regressions."""

    def __init__(self, dsn: str) -> None:
        self._dsn = dsn

    def execute_explain(self, sql: str) -> tuple[float, str]:
        """Run EXPLAIN (FORMAT JSON) on a query to capture plan cost.

        If the query is a write query, runs it inside a transaction that is rolled back.
        Returns:
            cost: The Total Cost of the plan (or float('inf') on error).
            plan_str: The raw JSON plan as a string.
        """
        is_write = any(
            sql.strip().lower().startswith(prefix)
            for prefix in ("insert", "update", "delete", "merge")
        )

        try:
            with psycopg.connect(self._dsn) as conn:
                # For write queries, use transaction to ensure rollback
                conn.autocommit = False
                with conn.cursor() as cur:
                    explain_query = f"EXPLAIN (FORMAT JSON) {sql}"
                    cur.execute(explain_query)
                    res = cur.fetchone()
                    plan_data = res[0] if res else None

                    if is_write:
                        conn.rollback()

                    if plan_data:
                        # plan_data is either a list/dict (if psycopg parsed it) or a string
                        if isinstance(plan_data, str):
                            plan_json = json.loads(plan_data)
                        else:
                            plan_json = plan_data
                        cost = plan_json[0]["Plan"]["Total Cost"]
                        return float(cost), json.dumps(plan_json, indent=2)

        except Exception as e:
            logger.warning("EXPLAIN failed for query: %s", e)

        return float("inf"), ""

    def run_ddl(self, ddl: str) -> bool:
        """Run a DDL statement (e.g. CREATE INDEX)."""
        try:
            with psycopg.connect(self._dsn) as conn:
                # Concurrent index creation cannot run inside a transaction block
                conn.autocommit = True
                with conn.cursor() as cur:
                    cur.execute(ddl)
            return True
        except Exception as e:
            logger.error("DDL execution failed: %s", e)
            return False

    def execute_and_verify(
        self,
        ddl: str,
        rollback_ddl: str,
        representative_query: str | None = None,
    ) -> tuple[str, str, str, str]:
        """Execute DDL, verify costs before/after, and rollback if regression occurs.

        Returns:
            status: 'completed', 'rolled_back', or 'failed'
            explain_before: Query plan before optimization
            explain_after: Query plan after optimization
            error_message: Any error message
        """
        explain_before = ""
        explain_after = ""
        cost_before = float("inf")

        if representative_query:
            cost_before, explain_before = self.execute_explain(representative_query)

        # Run optimization
        logger.info("Executing DDL: %s", ddl)
        success = self.run_ddl(ddl)
        if not success:
            return "failed", explain_before, "", "DDL execution failed"

        cost_after = float("inf")
        if representative_query:
            cost_after, explain_after = self.execute_explain(representative_query)

        # Verify regression: cost_after must be <= cost_before
        # If cost_after is inf (error) but cost_before was valid, or if cost_after > cost_before, rollback!
        if representative_query and cost_after > cost_before:
            logger.warning(
                "Regression detected! Cost before: %.2f, Cost after: %.2f. Rolling back...",
                cost_before,
                cost_after,
            )
            if rollback_ddl:
                rollback_success = self.run_ddl(rollback_ddl)
                if rollback_success:
                    return "rolled_back", explain_before, explain_after, f"Cost regressed from {cost_before} to {cost_after}"
                else:
                    return "failed", explain_before, explain_after, f"Cost regressed to {cost_after} and rollback DDL failed"

        return "completed", explain_before, explain_after, ""
