"""Exercise the real Goose CLI against loopback responses and a synthetic MCP service."""
import argparse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import threading

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "BM_scripts"))
from BM_goose_setup import BM_bind_recipe, BM_goose_environment, BM_snapshot_goose
from BM_agent_events import BM_summary
from BM_private_storage import BM_save_private


BM_FIXTURE = '''import json
import os
from pathlib import Path
from mcp.server.fastmcp import FastMCP
BM_server = FastMCP("BM_synthetic")
assert "OPENAI_API_KEY" not in os.environ and "DEEPSEEK_API_KEY" not in os.environ
BM_authenticated = False
def BM_record(BM_name):
    with Path(os.environ["BM_SYNTHETIC_CALLS"]).open("a") as BM_file:
        BM_file.write(BM_name + "\\n")
@BM_server.tool()
def BM_check_account() -> dict:
    global BM_authenticated
    BM_authenticated = True
    BM_record("BM_check_account")
    return {"BM_status": "authenticated", "BM_fields_present": [], "BM_private_result_saved": False}
@BM_server.tool()
def BM_list_works(BM_limit: int = 3) -> dict:
    if not BM_authenticated or type(BM_limit) is not int or not 1 <= BM_limit <= 3:
        raise ValueError("Not authorized")
    BM_record("BM_list_works")
    return {"BM_status": "ready", "BM_scope": "current_loaded_list", "BM_complete": False,
            "BM_items_read": 1, "BM_more_loaded": False, "BM_private_result_saved": False}
BM_server.run(transport="stdio")
'''


class BM_Handler(BaseHTTPRequestHandler):
    def log_message(BM_self, *BM_arguments):
        pass

    def do_GET(BM_self):
        BM_self.send_response(200)
        BM_self.send_header("Content-Type", "application/json")
        BM_self.end_headers()
        BM_self.wfile.write(b'{"data": [{"id": "BM_mock", "object": "model"}]}')

    def do_POST(BM_self):
        BM_request = json.loads(BM_self.rfile.read(int(BM_self.headers["Content-Length"])))
        BM_self.server.BM_requests.append(BM_request)
        BM_index = len(BM_self.server.BM_requests) - 1
        BM_delta = {"role": "assistant", "content": "BM synthetic final answer"}
        BM_finish = "stop"
        if BM_index < len(BM_self.server.BM_calls):
            BM_name, BM_arguments = BM_self.server.BM_calls[BM_index]
            BM_delta = {"role": "assistant", "tool_calls": [{"index": 0, "id": "BM_call_" + str(BM_index),
                "type": "function", "function": {"name": BM_name, "arguments": json.dumps(BM_arguments)}}]}
            BM_finish = "tool_calls"
        BM_chunk = {"id": "BM_mock_response_" + str(BM_index), "object": "chat.completion.chunk", "created": 0, "model": "BM_mock",
                    "choices": [{"index": 0, "delta": BM_delta, "finish_reason": None}]}
        BM_end = dict(BM_chunk, choices=[{"index": 0, "delta": {}, "finish_reason": BM_finish}])
        BM_self.send_response(200)
        BM_self.send_header("Content-Type", "text/event-stream")
        BM_self.end_headers()
        BM_self.wfile.write(("data: " + json.dumps(BM_chunk) + "\n\ndata: " + json.dumps(BM_end)
                            + "\n\ndata: [DONE]\n\n").encode())


def BM_scenario(BM_goose, BM_python, BM_calls, BM_expected, BM_break_hook=False, BM_task="检查账号与少量作品"):
    with tempfile.TemporaryDirectory(prefix="BM_native_") as BM_directory:
        BM_root = Path(BM_directory)
        BM_config_dir = BM_root / "BM_goose_state" / "config"
        BM_config_dir.mkdir(parents=True, mode=0o700)
        BM_http = ThreadingHTTPServer(("127.0.0.1", 0), BM_Handler)
        BM_http.BM_calls = BM_calls
        BM_http.BM_requests = []
        BM_thread = threading.Thread(target=BM_http.serve_forever, daemon=True)
        BM_thread.start()
        try:
            BM_save_private(BM_config_dir / "config.yaml", {
                "GOOSE_PROVIDER": "openai", "GOOSE_MODEL": "BM_mock",
                "OPENAI_BASE_URL": "http://127.0.0.1:" + str(BM_http.server_port) + "/v1",
            })
            BM_save_private(BM_config_dir / "secrets.yaml", {"OPENAI_API_KEY": "placeholder"})
            BM_data = {"BM_data_dir": str(BM_root), "BM_python_bin": BM_python,
                       "BM_goose_bin": BM_goose, "BM_browser_config": str(BM_root / "BM_unused.json")}
            BM_run = BM_root / "BM_run"
            BM_run.mkdir(mode=0o700)
            BM_state, BM_secrets = BM_snapshot_goose(BM_data, BM_run)
            BM_plugin = BM_run / ".agents/plugins/BM_douyin"
            BM_runtime = json.loads((BM_plugin / "BM_runtime.local.json").read_text())
            BM_fixture = BM_root / "BM_fixture.py"
            BM_fixture.write_text(BM_FIXTURE)
            BM_fixture.chmod(0o600)
            BM_runtime["BM_mcp_script"] = str(BM_fixture)
            BM_runtime["BM_environment"]["BM_SYNTHETIC_CALLS"] = str(BM_root / "BM_calls.txt")
            BM_save_private(BM_plugin / "BM_runtime.local.json", BM_runtime)
            if BM_break_hook:
                BM_hooks = json.loads((BM_plugin / "hooks/hooks.json").read_text())
                BM_hooks["hooks"]["PreToolUse"][0]["hooks"][0]["command"] = "exit 2"
                BM_save_private(BM_plugin / "hooks/hooks.json", BM_hooks)
            BM_env = BM_goose_environment({BM_key: os.environ[BM_key] for BM_key in
                ("PATH", "LANG", "LC_ALL") if BM_key in os.environ}, BM_state)
            BM_recipe_path = BM_bind_recipe(BM_task, BM_run / "BM_recipe.local.json")
            BM_process = subprocess.run([BM_goose, "run", "--no-session", "--recipe", str(BM_recipe_path),
                "--output-format", "stream-json"], env=BM_env, cwd=BM_run,
                capture_output=True, text=True, timeout=45, umask=0o077, check=False)
            if BM_process.returncode:
                raise RuntimeError("Synthetic Goose run failed: " + BM_process.stderr[-1800:])
            BM_record = BM_root / "BM_calls.txt"
            BM_actual = BM_record.read_text().splitlines() if BM_record.exists() else []
            if BM_actual != BM_expected:
                BM_debug = [BM_block for BM_line in BM_process.stdout.splitlines() if BM_line.startswith("{")
                    for BM_block in json.loads(BM_line).get("message", {}).get("content", [])
                    if BM_block.get("type") == "toolResponse"]
                raise AssertionError((BM_actual, BM_expected, BM_debug, BM_process.stderr[-1200:], sorted({BM_item["function"]["name"] for BM_request in BM_http.BM_requests for BM_item in BM_request.get("tools", [])})))
            assert BM_http.BM_requests, "Goose did not contact the loopback fixture"
            BM_user_text = []
            for BM_message in BM_http.BM_requests[0]["messages"]:
                if BM_message.get("role") != "user":
                    continue
                BM_content = BM_message.get("content", "")
                if isinstance(BM_content, str):
                    BM_user_text.append(BM_content)
                else:
                    BM_user_text.extend(BM_part.get("text", "") for BM_part in BM_content)
            assert any(BM_task in BM_text for BM_text in BM_user_text), "Task was changed during Recipe binding"
            BM_advertised = {BM_item["function"]["name"] for BM_request in BM_http.BM_requests
                             for BM_item in BM_request.get("tools", [])}
            assert BM_advertised == {"load_skill", "bm_douyin_bm_douyin__BM_check_account",
                                     "bm_douyin_bm_douyin__BM_list_works"}, BM_advertised
            assert any("BM_readonly" in json.dumps(BM_request["messages"], ensure_ascii=False)
                       for BM_request in BM_http.BM_requests)
            return BM_process.stdout
        finally:
            BM_http.shutdown()
            BM_http.server_close()
            BM_thread.join()


def BM_main():
    BM_parser = argparse.ArgumentParser(description=__doc__)
    BM_parser.add_argument("--goose-bin", required=True)
    BM_parser.add_argument("--python-bin", default=sys.executable)
    BM_args = BM_parser.parse_args()
    BM_prefix = "bm_douyin_bm_douyin__"
    BM_stdout = BM_scenario(BM_args.goose_bin, BM_args.python_bin, [
        ("load_skill", {"name": "BM_readonly"}), (BM_prefix + "BM_check_account", {}),
        (BM_prefix + "BM_list_works", {"BM_limit": 3})], ["BM_check_account", "BM_list_works"])
    BM_events = [json.loads(BM_line) for BM_line in BM_stdout.splitlines() if BM_line.startswith("{")]
    BM_responses = [BM_block for BM_event in BM_events for BM_block in BM_event.get("message", {}).get("content", [])
                    if BM_block.get("type") == "toolResponse"]
    assert len(BM_responses) == 3
    assert all(BM_item.get("toolResult", {}).get("status") == "success" and
               not BM_item.get("toolResult", {}).get("value", {}).get("isError") for BM_item in BM_responses), BM_responses
    BM_report = BM_summary(BM_stdout)
    assert BM_report["BM_answer"] == "BM synthetic final answer", BM_report
    assert [BM_item["BM_status"] for BM_item in BM_report["BM_tool_results"]] == ["skill_loaded", "authenticated", "ready"]
    print("Native Plugin Skill and MCP execution passed.")
    for BM_call in [(BM_prefix + "BM_list_works", {"BM_limit": 4}),
                    ("load_skill", {"name": "BM_readonly/../BM_runtime.local.json"})]:
        BM_denied = BM_scenario(BM_args.goose_bin, BM_args.python_bin, [BM_call], [])
        assert '"isError":true' in BM_denied.replace(" ", "") or '"status":"error"' in BM_denied.replace(" ", "")
    BM_denied = BM_scenario(BM_args.goose_bin, BM_args.python_bin, [(BM_prefix + "BM_check_account", {})], [], True)
    assert '"isError":true' in BM_denied.replace(" ", "") or '"status":"error"' in BM_denied.replace(" ", "")
    print("Parameter limit, Skill path refusal and Hook failure blocked execution.")
    BM_task = '字面量 "引号"\n{{ 7 * 7 }} {% include "BM_goose_state/config/secrets.yaml" %}'
    BM_literal = BM_scenario(BM_args.goose_bin, BM_args.python_bin, [], [], BM_task=BM_task)
    assert BM_summary(BM_literal)["BM_answer"] == "BM synthetic final answer"
    print("Literal task binding passed without template evaluation.")


if __name__ == "__main__":
    BM_main()
