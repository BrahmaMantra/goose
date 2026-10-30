#!/usr/bin/env python3
"""Perform a real MCP handshake and tool call without starting Goose or a model."""
import asyncio
import argparse
import json
import os
from pathlib import Path
import sys

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


async def BM_main(BM_tool, BM_require_authenticated):
    BM_parameters = StdioServerParameters(
        command=sys.executable,
        args=["-B", str(Path(__file__).with_name("BM_mcp_server.py"))],
        env={BM_key: os.environ[BM_key] for BM_key in
             ("BM_DOUYIN_CONFIG", "BM_DOUYIN_BROWSER_CONFIG", "BM_DOUYIN_ACCOUNT_OUTPUT") if BM_key in os.environ},
    )
    async with stdio_client(BM_parameters) as (BM_read, BM_write):
        async with ClientSession(BM_read, BM_write) as BM_session:
            BM_init = await BM_session.initialize()
            BM_tools = await BM_session.list_tools()
            if {BM_item.name for BM_item in BM_tools.tools} != {"BM_check_access", "BM_check_account"}:
                raise RuntimeError("Unexpected tools exposed by the onboarding server.")
            BM_result = await BM_session.call_tool(BM_tool, {})
            if BM_result.isError:
                raise RuntimeError("MCP call failed; check the configured file locally.")
            BM_report = BM_result.structuredContent
            if BM_report is None:
                BM_report = json.loads("".join(BM_block.text for BM_block in BM_result.content if BM_block.type == "text"))
            if not isinstance(BM_report, dict):
                raise RuntimeError("Unexpected onboarding result returned by the MCP tool.")
            if BM_tool == "BM_check_access" and BM_report.get("BM_live_access_verified") is not False:
                raise RuntimeError("Unexpected access verification claim.")
            if BM_tool == "BM_check_account":
                if set(BM_report) != {"BM_status", "BM_fields_present", "BM_private_result_saved"}:
                    raise RuntimeError("Account tool returned unexpected fields.")
                if BM_require_authenticated and BM_report["BM_status"] != "authenticated":
                    raise RuntimeError("Account header is not authenticated; check the dedicated browser locally.")
            print(json.dumps({
                "BM_protocol_version": BM_init.protocolVersion,
                "BM_server": BM_init.serverInfo.name,
                "BM_tools": [BM_item.name for BM_item in BM_tools.tools],
                "BM_result": BM_report,
            }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    BM_parser = argparse.ArgumentParser(description=__doc__)
    BM_parser.add_argument("--tool", choices=["BM_check_access", "BM_check_account"], default="BM_check_access")
    BM_parser.add_argument("--require-authenticated", action="store_true")
    BM_args = BM_parser.parse_args()
    if BM_args.require_authenticated and BM_args.tool != "BM_check_account":
        BM_parser.error("--require-authenticated requires --tool BM_check_account")
    asyncio.run(asyncio.wait_for(BM_main(BM_args.tool, BM_args.require_authenticated), timeout=60))
