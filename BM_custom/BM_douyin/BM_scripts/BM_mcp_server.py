#!/usr/bin/env python3
"""Expose the onboarding check as a Goose-compatible MCP stdio tool."""
from mcp.server.fastmcp import FastMCP
from BM_access_check import BM_check_access as BM_inspect_access, BM_config_path


BM_server = FastMCP("BM_douyin")


@BM_server.tool()
def BM_check_access() -> dict:
    """Report missing Douyin onboarding configuration. Does not access the account or a model."""
    try:
        return BM_inspect_access(BM_config_path())
    except (OSError, ValueError, TypeError, KeyError):
        raise ValueError("Cannot validate local configuration; compare it with BM_access.example.json.") from None


if __name__ == "__main__":
    BM_server.run(transport="stdio")
