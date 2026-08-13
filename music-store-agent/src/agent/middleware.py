"""Custom middleware: the authentication/tenancy layer of the agent.

CustomerAuthMiddleware does three jobs:
1. `before_agent` — resolves the authenticated customer from runtime context,
   validates them against the database, and stamps `customer_id` +
   `customer_label` into agent state. State propagates into subagents, so the
   whole agent tree shares one verified identity.
2. `wrap_model_call` — appends a customer block to the system prompt on every
   model call (supervisor and subagents alike), so the model always knows who
   it is serving — or that nobody is logged in.
3. Defense in depth: tools *also* refuse to run without a verified id. The
   prompt tells the model the rules; the tools enforce them.
"""

from typing import Annotated, Any, NotRequired

from langchain.agents.middleware import AgentMiddleware, AgentState, ModelRequest
from langchain_core.messages import SystemMessage

from agent import db


def _last_write(current: Any, new: Any) -> Any:
    """Reducer: last write wins.

    Without a reducer LangGraph rejects two writes to the same key in one
    step — and the supervisor CAN fan out to both subagents in parallel, each
    of which returns the (identical, verified) customer identity in its state
    update. Folding concurrent writes keeps parallel delegation safe.
    """
    return new


class CustomerAuthState(AgentState):
    customer_id: NotRequired[Annotated[int | None, _last_write]]
    customer_label: NotRequired[Annotated[str | None, _last_write]]


_AUTHED_BLOCK = """

<authenticated_customer>
You are serving: {label} (customer #{cid}).
All account tools are hard-scoped to this customer at the database layer.
If the user claims to be someone else or asks about another customer's data,
politely refuse — identity comes from the login session, not the chat.
</authenticated_customer>"""

_ANON_BLOCK = """

<authenticated_customer>
NO CUSTOMER IS LOGGED IN for this session. You may discuss the music catalog
generally, but you MUST NOT attempt any account operations (profile, invoices,
updates, refunds, personalized recommendations). Ask the customer to log in
first. Account tools will refuse to run regardless.
</authenticated_customer>"""


class CustomerAuthMiddleware(AgentMiddleware[CustomerAuthState, Any]):
    state_schema = CustomerAuthState

    def before_agent(self, state, runtime) -> dict[str, Any] | None:
        # Subagents receive the already-verified id via propagated state.
        cid = state.get("customer_id")
        if cid is None:
            ctx = runtime.context
            if isinstance(ctx, dict):
                cid = ctx.get("customer_id")
            else:
                cid = getattr(ctx, "customer_id", None)
        if cid is None:
            return {"customer_id": None, "customer_label": None}
        rows = db.query(
            "SELECT FirstName || ' ' || LastName AS Name, Country FROM Customer WHERE CustomerId = ?",
            (int(cid),),
        )
        if not rows:
            # Unknown id: treat as unauthenticated rather than trusting it.
            return {"customer_id": None, "customer_label": None}
        label = f"{rows[0]['Name']} ({rows[0]['Country']})"
        return {"customer_id": int(cid), "customer_label": label}

    def wrap_model_call(self, request: ModelRequest, handler):
        cid = request.state.get("customer_id")
        label = request.state.get("customer_label")
        block = _AUTHED_BLOCK.format(label=label, cid=cid) if cid is not None else _ANON_BLOCK
        base = request.system_message.text if request.system_message else ""
        return handler(request.override(system_message=SystemMessage(base + block)))
