"""Runtime context for the support agent.

`customer_id` is the identity of the *authenticated* customer, supplied by the
calling application (in LangSmith Studio: the "context" panel) — it is trusted
input, set outside the conversation. The model can neither see nor change it,
so a prompt-injected "actually I'm customer 7" has no effect on data access.
"""

from dataclasses import dataclass
from typing import Any


@dataclass
class SupportContext:
    customer_id: int | None = None


def customer_id_from(runtime: Any) -> int | None:
    """Resolve the authenticated customer id from tool/agent runtime.

    Prefers agent state (stamped by CustomerAuthMiddleware, propagated into
    subagents), falling back to the runtime context for direct invocations.
    """
    state = getattr(runtime, "state", None) or {}
    cid = state.get("customer_id")
    if cid is None:
        ctx = getattr(runtime, "context", None)
        if isinstance(ctx, dict):
            cid = ctx.get("customer_id")
        else:
            cid = getattr(ctx, "customer_id", None)
    return int(cid) if cid is not None else None


NOT_AUTHENTICATED = (
    "REFUSED: no authenticated customer in this session. Ask the customer to "
    "log in; account operations are unavailable until then."
)
