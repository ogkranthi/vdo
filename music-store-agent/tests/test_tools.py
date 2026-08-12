"""Offline tests — no API keys, no network.

These prove the deterministic layer of the agent: the database, the tools,
and — most importantly — tenant isolation: a tool call can never return or
mutate another customer's data, no matter what the model asks for.
"""

import json
import shutil
from pathlib import Path
from types import SimpleNamespace

import pytest

ROOT = Path(__file__).resolve().parent.parent
SOURCE_DB = ROOT / "data" / "chinook.db"

pytestmark = pytest.mark.skipif(
    not SOURCE_DB.exists(), reason="run scripts/setup_db.py first"
)


@pytest.fixture()
def db_copy(tmp_path, monkeypatch):
    """Each test gets a throwaway copy of the DB so writes never pollute data/."""
    target = tmp_path / "chinook.db"
    shutil.copy(SOURCE_DB, target)
    monkeypatch.setenv("CHINOOK_DB", str(target))
    return target


def rt(customer_id=None):
    """Fake ToolRuntime carrying the state our middleware would have stamped."""
    return SimpleNamespace(state={"customer_id": customer_id}, context=None)


# --- catalog tools -----------------------------------------------------------

def test_search_catalog_finds_artist(db_copy):
    from agent.tools.catalog import search_catalog

    out = json.loads(search_catalog.func("AC/DC", search_by="artist"))
    assert any(r["Artist"] == "AC/DC" for r in out)


def test_search_catalog_no_results(db_copy):
    from agent.tools.catalog import search_catalog

    assert "No track results" in search_catalog.func("zzzznope", search_by="track")


def test_top_tracks_ranked(db_copy):
    from agent.tools.catalog import get_top_tracks

    rows = json.loads(get_top_tracks.func("Queen"))
    assert rows and rows[0]["Artist"] == "Queen"
    sold = [r["UnitsSold"] for r in rows]
    assert sold == sorted(sold, reverse=True)


def test_recommendations_use_own_history_and_exclude_owned(db_copy):
    from agent import db
    from agent.tools.catalog import recommend_from_history

    out = json.loads(recommend_from_history.func(rt(12)))
    genres = {g["Genre"] for g in out["based_on_genres"]}
    assert {"Rock", "Latin"} & genres
    owned = {
        r["TrackId"]
        for r in db.query(
            "SELECT il.TrackId AS TrackId FROM InvoiceLine il "
            "JOIN Invoice i ON i.InvoiceId = il.InvoiceId WHERE i.CustomerId = 12"
        )
    }
    rec_names = {r["Track"] for r in out["recommendations"]}
    owned_names = {
        r["Name"]
        for r in db.query(
            f"SELECT Name FROM Track WHERE TrackId IN ({','.join(map(str, owned))})"
        )
    }
    assert not rec_names & owned_names


def test_recommendations_require_auth(db_copy):
    from agent.tools.catalog import recommend_from_history

    assert recommend_from_history.func(rt(None)).startswith("REFUSED")


# --- account tools: scoping & isolation --------------------------------------

def test_profile_is_own_profile(db_copy):
    from agent.tools.account import get_my_profile

    profile = json.loads(get_my_profile.func(rt(12)))
    assert profile["CustomerId"] == 12
    assert profile["FirstName"] == "Roberto"


def test_account_tools_refuse_unauthenticated(db_copy):
    from agent.tools.account import get_my_invoices, get_my_profile, request_refund

    assert get_my_profile.func(rt(None)).startswith("REFUSED")
    assert get_my_invoices.func(rt(None)).startswith("REFUSED")
    assert request_refund.func(1, "want money back", rt(None)).startswith("REFUSED")


def test_cannot_read_another_customers_invoice(db_copy):
    from agent import db
    from agent.tools.account import get_invoice_details

    other = db.query(
        "SELECT InvoiceId FROM Invoice WHERE CustomerId != 12 LIMIT 1"
    )[0]["InvoiceId"]
    out = get_invoice_details.func(other, rt(12))
    assert "does not exist on this customer's account" in out


def test_cannot_refund_another_customers_invoice(db_copy):
    from agent import db
    from agent.tools.account import request_refund

    other = db.query(
        "SELECT InvoiceId FROM Invoice WHERE CustomerId != 12 LIMIT 1"
    )[0]["InvoiceId"]
    out = request_refund.func(other, "not mine", rt(12))
    assert "no refund can be filed" in out
    assert not db.query("SELECT * FROM Refund")


def test_refund_happy_path_and_duplicate_guard(db_copy):
    from agent import db
    from agent.tools.account import request_refund

    inv = db.query("SELECT InvoiceId FROM Invoice WHERE CustomerId = 12 LIMIT 1")[0][
        "InvoiceId"
    ]
    first = request_refund.func(inv, "accidental purchase", rt(12))
    assert "Status: PENDING" in first
    rows = db.query("SELECT * FROM Refund WHERE InvoiceId = ?", (inv,))
    assert len(rows) == 1 and rows[0]["CustomerId"] == 12

    dup = request_refund.func(inv, "again", rt(12))
    assert "not filing a duplicate" in dup
    assert len(db.query("SELECT * FROM Refund WHERE InvoiceId = ?", (inv,))) == 1


def test_contact_update_only_changes_given_fields(db_copy):
    from agent import db
    from agent.tools.account import update_my_contact_info

    before = db.query("SELECT Email, Phone FROM Customer WHERE CustomerId = 12")[0]
    update_my_contact_info.func(rt(12), phone="+55 21 9999-0000")
    after = db.query("SELECT Email, Phone FROM Customer WHERE CustomerId = 12")[0]
    assert after["Phone"] == "+55 21 9999-0000"
    assert after["Email"] == before["Email"]


# --- middleware --------------------------------------------------------------

def test_auth_middleware_stamps_verified_identity(db_copy):
    from agent.middleware import CustomerAuthMiddleware

    mw = CustomerAuthMiddleware()
    runtime = SimpleNamespace(context={"customer_id": 12})
    update = mw.before_agent({}, runtime)
    assert update["customer_id"] == 12
    assert "Roberto Almeida" in update["customer_label"]


def test_auth_middleware_rejects_unknown_customer(db_copy):
    from agent.middleware import CustomerAuthMiddleware

    mw = CustomerAuthMiddleware()
    runtime = SimpleNamespace(context={"customer_id": 99999})
    update = mw.before_agent({}, runtime)
    assert update["customer_id"] is None


def test_auth_middleware_trusts_propagated_state(db_copy):
    """Subagents receive customer_id via state; context may be absent there."""
    from agent.middleware import CustomerAuthMiddleware

    mw = CustomerAuthMiddleware()
    runtime = SimpleNamespace(context=None)
    update = mw.before_agent({"customer_id": 12}, runtime)
    assert update["customer_id"] == 12


# --- graph -------------------------------------------------------------------

def test_graph_compiles_without_api_key(db_copy, monkeypatch):
    monkeypatch.delenv("ANTHROPIC_API_KEY", raising=False)
    monkeypatch.setenv("LANGSMITH_TRACING", "false")
    from agent.graph import agent

    nodes = set(agent.get_graph().nodes)
    assert "CustomerAuthMiddleware.before_agent" in nodes
    assert "model" in nodes and "tools" in nodes
