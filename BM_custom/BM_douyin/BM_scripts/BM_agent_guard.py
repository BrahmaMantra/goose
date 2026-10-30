#!/usr/bin/env python3
"""Fail-closed policy for the isolated Goose agent's tool calls."""
import json
import sys


def BM_decision(BM_payload):
    BM_name = BM_payload.get("tool_name")
    BM_arguments = BM_payload.get("tool_input") or {}
    if BM_name == "bm_douyin__BM_check_account" and BM_arguments == {}:
        return {"decision": "allow"}
    if (BM_name == "bm_douyin__BM_list_works" and isinstance(BM_arguments, dict)
            and not set(BM_arguments) - {"BM_limit"}
            and type(BM_arguments.get("BM_limit", 3)) is int
            and 1 <= BM_arguments.get("BM_limit", 3) <= 3):
        return {"decision": "allow"}
    return {"decision": "block", "reason": "This agent only permits account checks and up to three work cards. Do not retry a policy denial."}


def BM_main():
    try:
        BM_payload = json.load(sys.stdin)
        BM_result = BM_decision(BM_payload) if isinstance(BM_payload, dict) else {"decision": "block"}
    except (ValueError, TypeError):
        BM_result = {"decision": "block", "reason": "Invalid policy input."}
    print(json.dumps(BM_result))
    return 0


if __name__ == "__main__":
    sys.exit(BM_main())
