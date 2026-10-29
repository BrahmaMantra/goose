#!/usr/bin/env python3
"""Perform a real MCP handshake and tool call without starting Goose or a model."""
import asyncio
import json
import os
from pathlib import Path
import sys

from mcp import ClientSession, StdioServerParameters
from mcp.client.stdio import stdio_client


async def BM_main():
    BM_parameters = StdioServerParameters(
        command=sys.executable,
        args=["-B", str(Path(__file__).with_name("BM_mcp_server.py"))],
        env={"BM_DOUYIN_CONFIG": os.environ["BM_DOUYIN_CONFIG"]} if "BM_DOUYIN_CONFIG" in os.environ else None,
    )
    async with stdio_client(BM_parameters) as (BM_read, BM_write):
        async with ClientSession(BM_read, BM_write) as BM_session:
            BM_init = await BM_session.initialize()
            BM_tools = await BM_session.list_tools()
            if [BM_tool.name for BM_tool in BM_tools.tools] != ["BM_check_access"]:
                raise RuntimeError("Unexpected tools exposed by the onboarding server.")
            BM_result = await BM_session.call_tool("BM_check_access", {})
            if BM_result.isError:
                raise RuntimeError("MCP call failed; check the configured file locally.")
            BM_report = BM_result.structuredContent
            if BM_report is None:
                BM_report = json.loads("".join(BM_block.text for BM_block in BM_result.content if BM_block.type == "text"))
            if not isinstance(BM_report, dict) or BM_report.get("BM_live_access_verified") is not False:
                raise RuntimeError("Unexpected onboarding result returned by the MCP tool.")
            print(json.dumps({
                "BM_protocol_version": BM_init.protocolVersion,
                "BM_server": BM_init.serverInfo.name,
                "BM_tools": [BM_tool.name for BM_tool in BM_tools.tools],
                "BM_result": BM_report,
            }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    asyncio.run(asyncio.wait_for(BM_main(), timeout=20))
