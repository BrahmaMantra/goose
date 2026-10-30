"""Restrict this Plugin's tool calls and exact Skill loading."""
import json
from pathlib import Path
import sys


def BM_decision(BM_payload):
    BM_policy = json.loads(Path(__file__).resolve().parents[1].joinpath("BM_policy.json").read_text())
    BM_name = BM_payload.get("tool_name")
    BM_arguments = BM_payload.get("tool_input")
    if BM_arguments is None:
        BM_arguments = {}
    if not isinstance(BM_arguments, dict):
        return {"decision": "block"}
    if BM_name == "load_skill" and BM_arguments == {"name": BM_policy["BM_skill"]}:
        return {"decision": "allow"}
    BM_rule = BM_policy["BM_tools"].get(BM_name)
    if BM_rule:
        if BM_rule["BM_arguments"] == "empty" and BM_arguments == {}:
            return {"decision": "allow"}
        if (BM_rule["BM_arguments"] == "limit" and not set(BM_arguments) - {"BM_limit"}
                and type(BM_arguments.get("BM_limit", 3)) is int
                and 1 <= BM_arguments.get("BM_limit", 3) <= BM_rule["BM_max_limit"]):
            return {"decision": "allow"}
    return {"decision": "block", "reason": "Only the designated read-only Skill and account/works tools are permitted. Do not retry a denial."}


def BM_main():
    try:
        BM_payload = json.load(sys.stdin)
        BM_result = BM_decision(BM_payload) if isinstance(BM_payload, dict) else {"decision": "block"}
    except (OSError, ValueError, TypeError, KeyError):
        BM_result = {"decision": "block", "reason": "Invalid policy input or configuration."}
    print(json.dumps(BM_result))
    return 0


if __name__ == "__main__":
    sys.exit(BM_main())
