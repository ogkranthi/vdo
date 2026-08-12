"""Build the Chinook SQLite database used by the support agent.

Downloads the canonical Chinook SQL dump, materializes it into data/chinook.db,
and adds a `Refund` table so the agent's write-path (refund requests) has
somewhere to land without mutating the original dataset.

Run once before starting the agent:  python scripts/setup_db.py
"""

import sqlite3
import urllib.request
from pathlib import Path

CHINOOK_SQL_URL = (
    "https://raw.githubusercontent.com/lerocha/chinook-database/master/"
    "ChinookDatabase/DataSources/Chinook_Sqlite.sql"
)

ROOT = Path(__file__).resolve().parent.parent
DATA_DIR = ROOT / "data"
SQL_CACHE = DATA_DIR / "Chinook_Sqlite.sql"
DB_PATH = DATA_DIR / "chinook.db"

REFUND_SCHEMA = """
CREATE TABLE IF NOT EXISTS [Refund]
(
    [RefundId] INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    [InvoiceId] INTEGER NOT NULL,
    [CustomerId] INTEGER NOT NULL,
    [Amount] NUMERIC(10,2) NOT NULL,
    [Reason] NVARCHAR(500),
    [Status] NVARCHAR(20) NOT NULL DEFAULT 'PENDING',
    [CreatedAt] DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY ([InvoiceId]) REFERENCES [Invoice] ([InvoiceId]),
    FOREIGN KEY ([CustomerId]) REFERENCES [Customer] ([CustomerId])
);
"""


def download_sql() -> str:
    if SQL_CACHE.exists():
        print(f"Using cached SQL dump at {SQL_CACHE}")
        return SQL_CACHE.read_text(encoding="utf-8-sig")
    print(f"Downloading Chinook SQL from {CHINOOK_SQL_URL} ...")
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    with urllib.request.urlopen(CHINOOK_SQL_URL) as resp:
        raw = resp.read()
    SQL_CACHE.write_bytes(raw)
    return raw.decode("utf-8-sig")


def build_db() -> None:
    sql = download_sql()
    if DB_PATH.exists():
        DB_PATH.unlink()
    print(f"Building {DB_PATH} ...")
    conn = sqlite3.connect(DB_PATH)
    try:
        conn.executescript(sql)
        conn.executescript(REFUND_SCHEMA)
        conn.commit()
        counts = {
            table: conn.execute(f"SELECT COUNT(*) FROM [{table}]").fetchone()[0]
            for table in ("Customer", "Invoice", "Track", "Artist", "Genre")
        }
    finally:
        conn.close()
    print("Done. Row counts:", counts)


if __name__ == "__main__":
    build_db()
