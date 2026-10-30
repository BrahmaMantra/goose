"""Model-free Goose MCP invocation and bounded public result validation."""
import json
from pathlib import Path
import shlex
import subprocess
import tempfile

from BM_local_config import BM_environment
from BM_goose_setup import BM_prepare_goose


def BM_goose_probe(BM_data, BM_tool, BM_limit):
    if type(BM_limit) is not int or not 1 <= BM_limit <= 3:
        raise ValueError("Plugin probe reads at most three cards.")
    BM_prepare_goose(BM_data)
    BM_env = BM_environment(BM_data)
    BM_plugin = Path(BM_data["BM_data_dir"]) / ".agents" / "plugins" / "BM_douyin"
    BM_extension = shlex.join([BM_data["BM_python_bin"], "-B", str(BM_plugin / "BM_scripts" / "BM_mcp_entry.py")])
    BM_name = "BM_check_account" if BM_tool == "account" else "BM_list_works"
    with tempfile.NamedTemporaryFile(mode="w", prefix="BM_probe_", suffix=".json",
            dir=Path(BM_data["BM_data_dir"]) / "BM_results", delete=False) as BM_file:
        BM_steps = [{"action": "listTools"}]
        if BM_tool == "works":
            BM_steps.append({"action": "callTool", "name": "BM_check_account", "arguments": {}})
        BM_steps.append({"action": "callTool", "name": BM_name,
                         "arguments": {"BM_limit": BM_limit} if BM_tool == "works" else {}})
        json.dump({"steps": BM_steps}, BM_file)
        BM_script = Path(BM_file.name)
    try:
        BM_result = subprocess.run([BM_data["BM_goose_bin"], "mcp-probe", BM_extension,
            "--script", str(BM_script)], env=BM_env, cwd=BM_data["BM_data_dir"],
            capture_output=True, text=True, timeout=60, umask=0o077, check=False)
    finally:
        BM_script.unlink(missing_ok=True)
    if BM_result.returncode:
        raise RuntimeError("Goose probe failed.")
    BM_call = json.loads(BM_result.stdout)["results"][-1]
    if BM_call["name"] != BM_name or BM_call["result"].get("isError"):
        raise RuntimeError("Goose tool call failed.")
    BM_result = BM_call["result"]
    BM_report = BM_result.get("structuredContent")
    if BM_report is None:
        BM_report = json.loads("".join(BM_block["text"] for BM_block in BM_result["content"] if BM_block["type"] == "text"))
    BM_expected = ({"BM_status", "BM_fields_present", "BM_private_result_saved"} if BM_tool == "account" else
        {"BM_status", "BM_scope", "BM_complete", "BM_items_read", "BM_more_loaded", "BM_private_result_saved"})
    if not isinstance(BM_report, dict) or set(BM_report) != BM_expected:
        raise RuntimeError("Unexpected tool response; refusing to print it.")
    return BM_report
