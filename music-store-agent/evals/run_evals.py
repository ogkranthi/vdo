"""Run the agent against the LangSmith dataset and score it.

Two evaluators:
- `correctness` — LLM-as-judge (openevals) comparing the agent's answer to the
  example's reference, with reasoning attached to every score.
- `expected_tools_used` — deterministic trajectory check: did the run call the
  tools a correct solution needs? Catches "right answer, wrong path" (e.g.
  answering from hallucination instead of the database) and validates the
  refusal cases really skipped the data tools.

Results land as an experiment on the dataset in LangSmith, where runs can be
compared side by side across prompt/model changes.

Run:  python evals/run_evals.py
"""

import uuid

from langsmith import Client
from openevals.llm import create_llm_as_judge
from openevals.prompts import CORRECTNESS_PROMPT

from agent.context import SupportContext
from agent.graph import agent

from dataset import DATASET_NAME

JUDGE_MODEL = "anthropic:claude-sonnet-4-5"

DATA_TOOLS = {
    "search_catalog",
    "get_top_tracks",
    "recommend_from_history",
    "get_my_profile",
    "get_my_invoices",
    "get_invoice_details",
    "update_my_contact_info",
    "request_refund",
}


def run_agent(inputs: dict) -> dict:
    """Target function: one dataset example -> agent answer + tool trajectory."""
    result = agent.invoke(
        {"messages": [{"role": "user", "content": inputs["question"]}]},
        {"configurable": {"thread_id": str(uuid.uuid4())}, "recursion_limit": 50},
        context=SupportContext(customer_id=inputs.get("customer_id")),
    )
    tools_called: list[str] = []
    for message in result["messages"]:
        for call in getattr(message, "tool_calls", None) or []:
            tools_called.append(call["name"])
    return {"answer": result["messages"][-1].text, "tools_called": tools_called}


correctness = create_llm_as_judge(
    prompt=CORRECTNESS_PROMPT,
    feedback_key="correctness",
    model=JUDGE_MODEL,
)


def correctness_evaluator(inputs: dict, outputs: dict, reference_outputs: dict) -> dict:
    return correctness(
        inputs=inputs["question"],
        outputs=outputs["answer"],
        reference_outputs=reference_outputs["reference"],
    )


def expected_tools_used(outputs: dict, reference_outputs: dict) -> dict:
    expected = set(reference_outputs.get("expected_tools") or [])
    called = set(outputs.get("tools_called") or [])
    if not expected:
        # Refusal/conversational cases: correct runs touch no data tools.
        leaked = called & DATA_TOOLS
        return {
            "key": "expected_tools_used",
            "score": not leaked,
            "comment": f"data tools called on a no-tool case: {sorted(leaked)}" if leaked else "no data tools called, as expected",
        }
    missing = expected - called
    return {
        "key": "expected_tools_used",
        "score": not missing,
        "comment": f"missing expected tools: {sorted(missing)}" if missing else f"called all expected tools: {sorted(expected)}",
    }


def main() -> None:
    client = Client()
    results = client.evaluate(
        run_agent,
        data=DATASET_NAME,
        evaluators=[correctness_evaluator, expected_tools_used],
        experiment_prefix="support-agent",
        max_concurrency=2,
        metadata={"architecture": "deep-agent-supervisor", "model": "claude-sonnet-4-5"},
    )
    print(f"\nExperiment: {results.experiment_name}")
    print("Open it in LangSmith to inspect scores, judge reasoning, and traces.")


if __name__ == "__main__":
    main()
