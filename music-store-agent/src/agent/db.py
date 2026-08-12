"""SQLite access layer for the Chinook database.

Every query goes through parameterized SQL. Account-scoped queries take the
customer id as a bound parameter that originates from trusted runtime state —
never from model-generated text — which is what guarantees tenant isolation.
"""

import os
import sqlite3
from contextlib import closing
from pathlib import Path
from typing import Any

_DEFAULT_DB = Path(__file__).resolve().parents[2] / "data" / "chinook.db"


def db_path() -> Path:
    return Path(os.environ.get("CHINOOK_DB", _DEFAULT_DB))


def _connect() -> sqlite3.Connection:
    path = db_path()
    if not path.exists():
        raise RuntimeError(
            f"Chinook database not found at {path}. Run `python scripts/setup_db.py` first."
        )
    conn = sqlite3.connect(path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def query(sql: str, params: tuple = ()) -> list[dict[str, Any]]:
    """Run a read query and return rows as dicts."""
    with closing(_connect()) as conn:
        rows = conn.execute(sql, params).fetchall()
        return [dict(r) for r in rows]


def execute(sql: str, params: tuple = ()) -> int:
    """Run a write statement, commit, and return lastrowid."""
    with closing(_connect()) as conn:
        cur = conn.execute(sql, params)
        conn.commit()
        return cur.lastrowid
