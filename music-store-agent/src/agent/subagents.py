"""Subagent definitions: the two 'areas of work' of the support bot.

Each subagent gets ONLY the tools for its domain — a music question physically
cannot trigger an account write, and vice versa. Scoping tools per subagent
keeps each context window small and each prompt focused, which is the main
reliability argument for this architecture.
"""

from langchain.agents.middleware import InterruptOnConfig

from agent.middleware import CustomerAuthMiddleware
from agent.tools.account import ACCOUNT_TOOLS
from agent.tools.catalog import CATALOG_TOOLS

_auth = CustomerAuthMiddleware()

MUSIC_CATALOG_SUBAGENT = {
    "name": "music-catalog",
    "description": (
        "Music discovery specialist. Handles anything about the store's catalog: "
        "finding tracks/albums/artists/genres, best-sellers, and personalized "
        "recommendations based on the customer's own purchase history."
    ),
    "system_prompt": (
        "You are the music-discovery specialist for Melody Records, a digital "
        "music store. Use your tools to answer catalog questions precisely — "
        "never invent tracks, artists, or prices; everything you state must come "
        "from tool results. For personalized suggestions use recommend_from_history "
        "first, and present recommendations with artist + album + price. "
        "Keep answers concise and enthusiastic, like a knowledgeable record-store clerk. "
        "Your final message is returned to a supervisor agent, so make it a "
        "complete, customer-ready answer."
    ),
    "tools": CATALOG_TOOLS,
    "middleware": [_auth],
}

CUSTOMER_ACCOUNT_SUBAGENT = {
    "name": "customer-account",
    "description": (
        "Account and orders specialist. Handles the authenticated customer's "
        "profile, purchase history, invoice details, contact-info updates, and "
        "refund requests. All access is scoped to the logged-in customer only."
    ),
    "system_prompt": (
        "You are the account specialist for Melody Records. You can only access "
        "the authenticated customer's own data — the database layer enforces "
        "this, and you must never attempt to work around it. Answer billing and "
        "order questions from tool results only. For contact-info changes and "
        "refunds: confirm the details the customer wants, then call the tool — "
        "a human reviewer approves or rejects the actual write; tell the "
        "customer their request is being processed once the tool succeeds. "
        "Your final message is returned to a supervisor agent, so make it a "
        "complete, customer-ready answer."
    ),
    "tools": ACCOUNT_TOOLS,
    "middleware": [_auth],
    # Human-in-the-loop: both write tools pause the run for human approval.
    "interrupt_on": {
        "update_my_contact_info": InterruptOnConfig(
            allowed_decisions=["approve", "edit", "reject"],
            description="Customer contact-info change — verify before applying.",
        ),
        "request_refund": InterruptOnConfig(
            allowed_decisions=["approve", "edit", "reject"],
            description="Refund request — verify invoice and amount before filing.",
        ),
    },
}

SUBAGENTS = [MUSIC_CATALOG_SUBAGENT, CUSTOMER_ACCOUNT_SUBAGENT]
