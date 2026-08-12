"""Music catalog tools — read-only, no PII.

`recommend_from_history` is the one catalog tool that touches customer data:
it reads the *authenticated* customer's purchase history (never anyone
else's) to personalize recommendations.
"""

import json
from typing import Literal

from langchain.tools import ToolRuntime, tool

from agent import db
from agent.context import NOT_AUTHENTICATED, customer_id_from

_SEARCH_SQL = {
    "track": """
        SELECT t.Name AS Track, ar.Name AS Artist, al.Title AS Album,
               g.Name AS Genre, t.UnitPrice AS Price
        FROM Track t
        JOIN Album al ON al.AlbumId = t.AlbumId
        JOIN Artist ar ON ar.ArtistId = al.ArtistId
        LEFT JOIN Genre g ON g.GenreId = t.GenreId
        WHERE t.Name LIKE ? ORDER BY ar.Name, al.Title LIMIT ?
    """,
    "artist": """
        SELECT ar.Name AS Artist, COUNT(DISTINCT al.AlbumId) AS Albums,
               COUNT(t.TrackId) AS Tracks
        FROM Artist ar
        LEFT JOIN Album al ON al.ArtistId = ar.ArtistId
        LEFT JOIN Track t ON t.AlbumId = al.AlbumId
        WHERE ar.Name LIKE ? GROUP BY ar.ArtistId ORDER BY ar.Name LIMIT ?
    """,
    "album": """
        SELECT al.Title AS Album, ar.Name AS Artist, COUNT(t.TrackId) AS Tracks,
               ROUND(SUM(t.UnitPrice), 2) AS AlbumPrice
        FROM Album al
        JOIN Artist ar ON ar.ArtistId = al.ArtistId
        LEFT JOIN Track t ON t.AlbumId = al.AlbumId
        WHERE al.Title LIKE ? GROUP BY al.AlbumId ORDER BY ar.Name LIMIT ?
    """,
    "genre": """
        SELECT g.Name AS Genre, COUNT(t.TrackId) AS Tracks
        FROM Genre g
        LEFT JOIN Track t ON t.GenreId = g.GenreId
        WHERE g.Name LIKE ? GROUP BY g.GenreId ORDER BY Tracks DESC LIMIT ?
    """,
}


@tool
def search_catalog(
    query: str,
    search_by: Literal["track", "artist", "album", "genre"] = "track",
    limit: int = 10,
) -> str:
    """Search the store catalog for tracks, artists, albums, or genres.

    Args:
        query: Free-text name to search for (partial matches allowed).
        search_by: Which entity to search.
        limit: Max results (default 10).
    """
    rows = db.query(_SEARCH_SQL[search_by], (f"%{query}%", min(limit, 25)))
    if not rows:
        return f"No {search_by} results for {query!r}. Try a shorter or different term."
    return json.dumps(rows, ensure_ascii=False)


@tool
def get_top_tracks(artist: str, limit: int = 10) -> str:
    """Best-selling tracks by an artist (ranked by units sold across the store).

    Args:
        artist: Artist name (partial match allowed).
        limit: Max tracks to return.
    """
    rows = db.query(
        """
        SELECT t.Name AS Track, al.Title AS Album, ar.Name AS Artist,
               COUNT(il.InvoiceLineId) AS UnitsSold, t.UnitPrice AS Price
        FROM Track t
        JOIN Album al ON al.AlbumId = t.AlbumId
        JOIN Artist ar ON ar.ArtistId = al.ArtistId
        LEFT JOIN InvoiceLine il ON il.TrackId = t.TrackId
        WHERE ar.Name LIKE ?
        GROUP BY t.TrackId ORDER BY UnitsSold DESC, t.Name LIMIT ?
        """,
        (f"%{artist}%", min(limit, 25)),
    )
    if not rows:
        return f"No artist matching {artist!r} in the catalog."
    return json.dumps(rows, ensure_ascii=False)


@tool
def recommend_from_history(runtime: ToolRuntime, limit: int = 8) -> str:
    """Personalized recommendations from the customer's own purchase history.

    Finds the customer's most-purchased genres, then returns the store's
    best-selling tracks in those genres that the customer has NOT yet bought.

    Args:
        limit: Max recommendations to return.
    """
    cid = customer_id_from(runtime)
    if cid is None:
        return NOT_AUTHENTICATED
    top_genres = db.query(
        """
        SELECT g.Name AS Genre, COUNT(*) AS Purchased
        FROM InvoiceLine il
        JOIN Invoice i ON i.InvoiceId = il.InvoiceId
        JOIN Track t ON t.TrackId = il.TrackId
        JOIN Genre g ON g.GenreId = t.GenreId
        WHERE i.CustomerId = ?
        GROUP BY g.GenreId ORDER BY Purchased DESC LIMIT 3
        """,
        (cid,),
    )
    if not top_genres:
        return (
            "This customer has no purchase history yet. Ask what they enjoy and "
            "use search_catalog / get_top_tracks instead."
        )
    genre_names = [g["Genre"] for g in top_genres]
    placeholders = ",".join("?" for _ in genre_names)
    recs = db.query(
        f"""
        SELECT t.Name AS Track, ar.Name AS Artist, al.Title AS Album,
               g.Name AS Genre, COUNT(il.InvoiceLineId) AS UnitsSold,
               t.UnitPrice AS Price
        FROM Track t
        JOIN Album al ON al.AlbumId = t.AlbumId
        JOIN Artist ar ON ar.ArtistId = al.ArtistId
        JOIN Genre g ON g.GenreId = t.GenreId
        LEFT JOIN InvoiceLine il ON il.TrackId = t.TrackId
        WHERE g.Name IN ({placeholders})
          AND t.TrackId NOT IN (
              SELECT il2.TrackId FROM InvoiceLine il2
              JOIN Invoice i2 ON i2.InvoiceId = il2.InvoiceId
              WHERE i2.CustomerId = ?
          )
        GROUP BY t.TrackId ORDER BY UnitsSold DESC, t.Name LIMIT ?
        """,
        (*genre_names, cid, min(limit, 20)),
    )
    return json.dumps({"based_on_genres": top_genres, "recommendations": recs}, ensure_ascii=False)


CATALOG_TOOLS = [search_catalog, get_top_tracks, recommend_from_history]
