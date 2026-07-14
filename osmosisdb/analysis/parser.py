"""SQL metadata extraction using sqlglot.

Extracts tables, filtered columns, JOIN columns, and ORDER BY columns
from a PostgreSQL SQL statement.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass, field

import sqlglot
from sqlglot import exp

logger = logging.getLogger(__name__)


@dataclass(slots=True)
class QueryMetadata:
    """Extracted metadata from a SQL query."""

    tables: list[str] = field(default_factory=list)
    filter_columns: list[str] = field(default_factory=list)
    join_columns: list[str] = field(default_factory=list)
    order_columns: list[str] = field(default_factory=list)
    # Table-scoped columns as (table_name, column_name)
    table_filter_columns: list[tuple[str, str]] = field(default_factory=list)
    table_join_columns: list[tuple[str, str]] = field(default_factory=list)


def extract_metadata(sql: str) -> QueryMetadata:
    """Parse SQL and extract structural metadata. Returns empty metadata on parse failure."""
    meta = QueryMetadata()
    try:
        tree = sqlglot.parse_one(sql, read="postgres", error_level=sqlglot.ErrorLevel.IGNORE)
    except Exception:
        logger.debug("Failed to parse SQL: %.100s", sql)
        return meta

    # Tables
    meta.tables = list({t.name for t in tree.find_all(exp.Table) if t.name})

    # Resolve table aliases
    alias_map = {}
    for table in tree.find_all(exp.Table):
        if table.name:
            if table.alias:
                alias_map[table.alias] = table.name
            alias_map[table.name] = table.name

    # WHERE columns
    for where in tree.find_all(exp.Where):
        for c in where.find_all(exp.Column):
            if c.name:
                table_name = alias_map.get(c.table, "") if c.table else ""
                if not table_name and len(meta.tables) == 1:
                    table_name = meta.tables[0]
                meta.filter_columns.append(c.name)
                if table_name:
                    meta.table_filter_columns.append((table_name, c.name))
    
    meta.filter_columns = list(set(meta.filter_columns))
    meta.table_filter_columns = list(set(meta.table_filter_columns))

    # JOIN columns — columns inside ON conditions
    for join in tree.find_all(exp.Join):
        on = join.find(exp.EQ)
        if on:
            for c in on.find_all(exp.Column):
                if c.name:
                    table_name = alias_map.get(c.table, "") if c.table else ""
                    if not table_name and len(meta.tables) == 1:
                        table_name = meta.tables[0]
                    meta.join_columns.append(c.name)
                    if table_name:
                        meta.table_join_columns.append((table_name, c.name))
                        
    meta.join_columns = list(set(meta.join_columns))
    meta.table_join_columns = list(set(meta.table_join_columns))

    # ORDER BY columns
    for order in tree.find_all(exp.Ordered):
        col = order.find(exp.Column)
        if col and col.name:
            meta.order_columns.append(col.name)
    meta.order_columns = list(set(meta.order_columns))

    return meta
