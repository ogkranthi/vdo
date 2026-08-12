"""Customer account tools — every query is scoped to the authenticated customer.

The customer id is resolved from trusted runtime state/context
(`customer_id_from`), never from a model-supplied argument. Notice that no
tool here even *accepts* a customer id parameter: the model cannot ask for
another customer's data because there is no argument through which to try.
"""

import json

from langchain.tools import ToolRuntime, tool

from agent import db
from agent.context import NOT_AUTHENTICATED, customer_id_from


@tool
def get_my_profile(runtime: ToolRuntime) -> str:
    """Get the authenticated customer's profile (name, contact info, support rep)."""
    cid = customer_id_from(runtime)
    if cid is None:
        return NOT_AUTHENTICATED
    rows = db.query(
        """
        SELECT c.CustomerId, c.FirstName, c.LastName, c.Company, c.Address,
               c.City, c.State, c.Country, c.PostalCode, c.Phone, c.Email,
               e.FirstName || ' ' || e.LastName AS SupportRep
        FROM Customer c
        LEFT JOIN Employee e ON e.EmployeeId = c.SupportRepId
        WHERE c.CustomerId = ?
        """,
        (cid,),
    )
    return json.dumps(rows[0], ensure_ascii=False) if rows else f"No customer #{cid} found."


@tool
def get_my_invoices(runtime: ToolRuntime, limit: int = 10) -> str:
    """List the authenticated customer's most recent invoices (newest first).

    Args:
        limit: Max invoices to return.
    """
    cid = customer_id_from(runtime)
    if cid is None:
        return NOT_AUTHENTICATED
    rows = db.query(
        """
        SELECT i.InvoiceId, DATE(i.InvoiceDate) AS InvoiceDate, i.Total,
               i.BillingCity, i.BillingCountry,
               (SELECT COUNT(*) FROM InvoiceLine il WHERE il.InvoiceId = i.InvoiceId) AS Items,
               (SELECT r.Status FROM Refund r WHERE r.InvoiceId = i.InvoiceId
                ORDER BY r.RefundId DESC LIMIT 1) AS RefundStatus
        FROM Invoice i
        WHERE i.CustomerId = ?
        ORDER BY i.InvoiceDate DESC LIMIT ?
        """,
        (cid, min(limit, 30)),
    )
    if not rows:
        return "No purchases on this account yet."
    return json.dumps(rows, ensure_ascii=False)


@tool
def get_invoice_details(invoice_id: int, runtime: ToolRuntime) -> str:
    """Line items for one of the authenticated customer's invoices.

    Args:
        invoice_id: The invoice to inspect. Must belong to this customer.
    """
    cid = customer_id_from(runtime)
    if cid is None:
        return NOT_AUTHENTICATED
    header = db.query(
        "SELECT InvoiceId, DATE(InvoiceDate) AS InvoiceDate, Total FROM Invoice "
        "WHERE InvoiceId = ? AND CustomerId = ?",
        (invoice_id, cid),
    )
    if not header:
        return (
            f"Invoice #{invoice_id} does not exist on this customer's account. "
            "Only the authenticated customer's own invoices are accessible."
        )
    lines = db.query(
        """
        SELECT t.Name AS Track, ar.Name AS Artist, al.Title AS Album,
               il.UnitPrice, il.Quantity
        FROM InvoiceLine il
        JOIN Track t ON t.TrackId = il.TrackId
        JOIN Album al ON al.AlbumId = t.AlbumId
        JOIN Artist ar ON ar.ArtistId = al.ArtistId
        WHERE il.InvoiceId = ?
        ORDER BY ar.Name, t.Name
        """,
        (invoice_id,),
    )
    return json.dumps({"invoice": header[0], "lines": lines}, ensure_ascii=False)


@tool
def update_my_contact_info(
    runtime: ToolRuntime,
    email: str | None = None,
    phone: str | None = None,
    address: str | None = None,
    city: str | None = None,
    country: str | None = None,
) -> str:
    """Update the authenticated customer's contact details. Only provided fields change.

    This is a write operation: it is gated behind human approval (the run
    pauses until a person approves, edits, or rejects the change).

    Args:
        email: New email address.
        phone: New phone number.
        address: New street address.
        city: New city.
        country: New country.
    """
    cid = customer_id_from(runtime)
    if cid is None:
        return NOT_AUTHENTICATED
    updates = {
        "Email": email, "Phone": phone, "Address": address, "City": city, "Country": country,
    }
    updates = {k: v for k, v in updates.items() if v}
    if not updates:
        return "Nothing to update — provide at least one field."
    set_clause = ", ".join(f"{col} = ?" for col in updates)
    db.execute(
        f"UPDATE Customer SET {set_clause} WHERE CustomerId = ?",
        (*updates.values(), cid),
    )
    return f"Updated {', '.join(updates)} for customer #{cid}."


@tool
def request_refund(invoice_id: int, reason: str, runtime: ToolRuntime) -> str:
    """File a refund request for one of the authenticated customer's invoices.

    Validates that the invoice belongs to this customer and has no open
    refund, then records a PENDING refund for the invoice total. This is a
    write operation gated behind human approval.

    Args:
        invoice_id: Invoice to refund. Must belong to this customer.
        reason: Customer's stated reason for the refund.
    """
    cid = customer_id_from(runtime)
    if cid is None:
        return NOT_AUTHENTICATED
    inv = db.query(
        "SELECT InvoiceId, Total, DATE(InvoiceDate) AS InvoiceDate FROM Invoice "
        "WHERE InvoiceId = ? AND CustomerId = ?",
        (invoice_id, cid),
    )
    if not inv:
        return (
            f"Invoice #{invoice_id} does not exist on this customer's account, "
            "so no refund can be filed."
        )
    existing = db.query(
        "SELECT RefundId, Status FROM Refund WHERE InvoiceId = ? AND Status IN ('PENDING', 'APPROVED')",
        (invoice_id,),
    )
    if existing:
        return (
            f"Invoice #{invoice_id} already has refund #{existing[0]['RefundId']} "
            f"with status {existing[0]['Status']} — not filing a duplicate."
        )
    refund_id = db.execute(
        "INSERT INTO Refund (InvoiceId, CustomerId, Amount, Reason) VALUES (?, ?, ?, ?)",
        (invoice_id, cid, inv[0]["Total"], reason.strip()[:500]),
    )
    return (
        f"Refund #{refund_id} filed for invoice #{invoice_id} "
        f"(${inv[0]['Total']}, purchased {inv[0]['InvoiceDate']}). Status: PENDING — "
        "the customer will be notified once it is processed (3-5 business days)."
    )


ACCOUNT_TOOLS = [
    get_my_profile,
    get_my_invoices,
    get_invoice_details,
    update_my_contact_info,
    request_refund,
]
