#!/usr/bin/env python3
"""Expose the onboarding check as a Goose-compatible MCP stdio tool."""
import os
import subprocess
from typing import Annotated
from mcp.server.fastmcp import FastMCP
from pydantic import Field
from BM_access_check import BM_check_access as BM_inspect_access, BM_config_path
from BM_browser_account import BM_read_account
from BM_private_storage import BM_private_path, BM_save_private
from BM_browser_works import BM_read_works, BM_works_summary


BM_server = FastMCP("BM_douyin")
BM_AGENT_MODE = os.environ.get("BM_DOUYIN_AGENT_MODE") == "1"
BM_AGENT_AUTHENTICATED = False


def BM_check_access() -> dict:
    """Report missing Douyin onboarding configuration. Does not access the account or a model."""
    try:
        return BM_inspect_access(BM_config_path())
    except (OSError, ValueError, TypeError, KeyError):
        raise ValueError("Cannot validate local configuration; compare it with BM_access.example.json.") from None


if not BM_AGENT_MODE:
    BM_server.tool()(BM_check_access)


@BM_server.tool()
def BM_check_account() -> dict:
    """Check the creator homepage account header using the configured local browser. Returns status and field presence only; no account values, cookies or credentials."""
    global BM_AGENT_AUTHENTICATED
    BM_AGENT_AUTHENTICATED = False
    BM_config = os.environ.get("BM_DOUYIN_BROWSER_CONFIG")
    if not BM_config:
        return {"BM_status": "not_configured", "BM_fields_present": [], "BM_private_result_saved": False}
    BM_output = os.environ.get("BM_DOUYIN_ACCOUNT_OUTPUT")
    try:
        if BM_output:
            BM_private_path(BM_output)
        BM_report = BM_read_account(BM_config)
        if BM_output:
            BM_save_private(BM_output, BM_report)
    except (OSError, ValueError, TypeError, AttributeError, RuntimeError, subprocess.TimeoutExpired):
        raise ValueError("Account check failed. Inspect the private configuration, permissions and dedicated browser session locally.") from None
    BM_AGENT_AUTHENTICATED = BM_report["BM_status"] == "authenticated"
    return {"BM_status": BM_report["BM_status"],
            "BM_fields_present": [BM_field for BM_field in ("BM_display_name", "BM_douyin_id") if BM_field in BM_report],
            "BM_private_result_saved": BM_output is not None}


@BM_server.tool()
def BM_list_works(BM_limit: Annotated[int, Field(strict=True, ge=1, le=10)] = 3) -> dict:
    """Read at most BM_limit rendered work cards from the creator content page. Local fields are title/description text, displayed time, status label and truncation flag; no engagement metrics. Only execution status, scope and number of cards read are returned; field values stay in the private file. No pagination, export or account writes."""
    if BM_AGENT_MODE and (BM_limit > 3 or not BM_AGENT_AUTHENTICATED):
        raise ValueError("Agent must first verify login, and may read at most three cards.")
    BM_config = os.environ.get("BM_DOUYIN_BROWSER_CONFIG")
    if not BM_config:
        return BM_works_summary({"BM_status": "not_configured", "BM_scope": "current_loaded_list", "BM_items": []})
    BM_output = os.environ.get("BM_DOUYIN_WORKS_OUTPUT")
    try:
        if BM_output:
            BM_private_path(BM_output)
        BM_report = BM_read_works(BM_config, BM_limit)
        if BM_output:
            BM_save_private(BM_output, BM_report)
    except (OSError, ValueError, TypeError, AttributeError, RuntimeError, subprocess.TimeoutExpired):
        raise ValueError("Works check failed. Inspect the private configuration, permissions and browser locally.") from None
    return BM_works_summary(BM_report, BM_output is not None)


if __name__ == "__main__":
    BM_server.run(transport="stdio")
