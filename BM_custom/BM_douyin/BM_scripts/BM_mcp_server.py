#!/usr/bin/env python3
"""Expose the onboarding check as a Goose-compatible MCP stdio tool."""
import os
import subprocess
from mcp.server.fastmcp import FastMCP
from BM_access_check import BM_check_access as BM_inspect_access, BM_config_path
from BM_browser_account import BM_private_path, BM_read_account, BM_save_private


BM_server = FastMCP("BM_douyin")


@BM_server.tool()
def BM_check_access() -> dict:
    """Report missing Douyin onboarding configuration. Does not access the account or a model."""
    try:
        return BM_inspect_access(BM_config_path())
    except (OSError, ValueError, TypeError, KeyError):
        raise ValueError("Cannot validate local configuration; compare it with BM_access.example.json.") from None


@BM_server.tool()
def BM_check_account() -> dict:
    """Check the creator homepage account header using the configured local browser. Returns status and field presence only; no account values, cookies or credentials."""
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
    return {"BM_status": BM_report["BM_status"],
            "BM_fields_present": [BM_field for BM_field in ("BM_display_name", "BM_douyin_id") if BM_field in BM_report],
            "BM_private_result_saved": BM_output is not None}


if __name__ == "__main__":
    BM_server.run(transport="stdio")
