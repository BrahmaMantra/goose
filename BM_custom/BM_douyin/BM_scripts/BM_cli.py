"""Standalone local CLI for the model-free Douyin browser tools."""
import argparse
import json
import os
from pathlib import Path
import re
import shlex
import stat
import subprocess
import sys
import tempfile

from BM_browser_account import BM_read_account
from BM_browser_session import BM_REPOSITORY, BM_load_browser_config, BM_private_path, BM_save_private
from BM_browser_works import BM_read_works, BM_works_summary


BM_APP = Path(__file__).resolve().parents[1]
BM_DEFAULT_LOCAL = BM_REPOSITORY.parent / ".local" / "BM_douyin"
BM_CONFIG_NAME = "BM_config.local.json"


def BM_private_directory(BM_value):
    BM_path = BM_private_path(BM_value)
    if not BM_path.name.startswith("BM_"):
        raise ValueError("Use a dedicated BM_ directory for private state.")
    BM_path.mkdir(parents=True, exist_ok=True, mode=0o700)
    BM_path.chmod(0o700)
    return BM_path


def BM_config(BM_local):
    BM_path = BM_private_path(BM_local) / BM_CONFIG_NAME
    if stat.S_IMODE(BM_path.stat().st_mode) & 0o077:
        raise ValueError("Local configuration must be private.")
    BM_data = json.loads(BM_path.read_text())
    if (not isinstance(BM_data, dict)
            or set(BM_data) != {"BM_schema", "BM_data_dir", "BM_browser_config", "BM_python_bin", "BM_goose_bin"}
            or type(BM_data["BM_schema"]) is not int or BM_data["BM_schema"] != 1
            or any(not isinstance(BM_data[BM_key], str) or not BM_data[BM_key]
                   for BM_key in ("BM_data_dir", "BM_browser_config", "BM_python_bin", "BM_goose_bin"))):
        raise ValueError("Invalid local CLI configuration.")
    BM_root = BM_private_path(BM_data["BM_data_dir"])
    if not BM_root.is_dir() or stat.S_IMODE(BM_root.stat().st_mode) & 0o077:
        raise ValueError("Private data directory is unavailable.")
    BM_private_path(BM_data["BM_browser_config"])
    return BM_data


def BM_doctor(BM_data):
    BM_checks = {"BM_python": Path(BM_data["BM_python_bin"]).is_file() and os.access(BM_data["BM_python_bin"], os.X_OK),
                 "BM_goose": Path(BM_data["BM_goose_bin"]).is_file() and os.access(BM_data["BM_goose_bin"], os.X_OK)}
    try:
        BM_browser = BM_load_browser_config(BM_data["BM_browser_config"])
        BM_checks["BM_browser_config"] = True
        BM_checks["BM_node"] = Path(BM_browser["BM_node_bin"]).is_file() and os.access(BM_browser["BM_node_bin"], os.X_OK)
        BM_checks["BM_playwright_cli"] = Path(BM_browser["BM_cli_script"]).is_file()
    except (OSError, ValueError, TypeError):
        BM_checks["BM_browser_config"] = False
    BM_checks["BM_mcp_sdk"] = False
    if BM_checks["BM_python"]:
        BM_probe = subprocess.run([BM_data["BM_python_bin"], "-B", "-c",
            "import importlib.util; raise SystemExit(0 if importlib.util.find_spec('mcp') else 1)"],
            capture_output=True, timeout=10, check=False)
        BM_checks["BM_mcp_sdk"] = BM_probe.returncode == 0
    return {"BM_ready": all(BM_checks.values()), "BM_checks": BM_checks}


def BM_prepare(BM_local):
    BM_root = BM_private_directory(BM_local)
    BM_private = BM_private_directory(BM_root / "BM_private")
    BM_path = BM_root / BM_CONFIG_NAME
    if not BM_path.exists():
        BM_save_private(BM_path, {"BM_schema": 1, "BM_data_dir": str(BM_private),
            "BM_browser_config": str(BM_private / "BM_browser" / "BM_browser.local.json"),
            "BM_python_bin": str(BM_root / "BM_venv" / "bin" / "python"),
            "BM_goose_bin": str(BM_private / "BM_goose" / "goose")})
    BM_data = BM_config(BM_root)
    BM_private_directory(Path(BM_data["BM_data_dir"]) / "BM_results")
    BM_private_directory(Path(BM_data["BM_data_dir"]) / "BM_goose_state")
    BM_bin = BM_private_directory(BM_root / "BM_bin")
    BM_launcher = BM_bin / "BM_douyin"
    with tempfile.NamedTemporaryFile(mode="w", prefix="BM_cli_", dir=BM_bin, delete=False) as BM_file:
        BM_file.write("#!/bin/sh\nexec " + shlex.join([
            sys.executable, str(BM_APP / "BM_douyin"), "--local-dir", str(BM_root)]) + ' "$@"\n')
        BM_temporary = Path(BM_file.name)
    try:
        BM_temporary.chmod(0o700)
        os.replace(BM_temporary, BM_launcher)
    finally:
        BM_temporary.unlink(missing_ok=True)
    BM_status = BM_doctor(BM_data)
    BM_status.update(BM_local_dir=str(BM_root), BM_cli_entry=str(BM_launcher))
    return BM_data, BM_status


def BM_browser_command(BM_data, BM_arguments, BM_timeout=40):
    BM_browser = BM_load_browser_config(BM_data["BM_browser_config"])
    return subprocess.run([BM_browser["BM_node_bin"], BM_browser["BM_cli_script"],
        "-s=" + BM_browser["BM_session"], *BM_arguments], cwd=BM_browser["BM_workspace"],
        capture_output=True, text=True, timeout=BM_timeout, check=False)


def BM_browser_open(BM_data):
    BM_browser = BM_load_browser_config(BM_data["BM_browser_config"])
    BM_listing = BM_browser_command(BM_data, ["list"])
    if BM_listing.returncode:
        raise RuntimeError("Cannot inspect browser sessions.")
    BM_pattern = r"(?m)^- " + re.escape(BM_browser["BM_session"]) + r":\s*\n\s+- status: open\b"
    if re.search(BM_pattern, BM_listing.stdout):
        return {"BM_browser_open": True, "BM_reused_session": True}
    BM_profile = BM_private_directory(Path(BM_browser["BM_workspace"]) / "BM_profile")
    BM_result = BM_browser_command(BM_data, ["--json", "open", "https://creator.douyin.com/",
        "--browser=chrome", "--headed", "--persistent", "--profile=" + str(BM_profile)])
    BM_save_private(Path(BM_data["BM_data_dir"]) / "BM_results" / "BM_browser_open.local.json",
                    {"BM_stdout": BM_result.stdout, "BM_stderr": BM_result.stderr})
    if BM_result.returncode or json.loads(BM_result.stdout).get("isError"):
        raise RuntimeError("Browser could not be opened.")
    return {"BM_browser_open": True, "BM_reused_session": False}


def BM_environment(BM_data):
    BM_root = Path(BM_data["BM_data_dir"])
    BM_env = os.environ.copy()
    BM_env.update(BM_DOUYIN_BROWSER_CONFIG=BM_data["BM_browser_config"],
        BM_DOUYIN_ACCOUNT_OUTPUT=str(BM_root / "BM_results" / "BM_account.local.json"),
        BM_DOUYIN_WORKS_OUTPUT=str(BM_root / "BM_results" / "BM_works.local.json"),
        GOOSE_PATH_ROOT=str(BM_root / "BM_goose_state"), GOOSE_TELEMETRY_ENABLED="false", GOOSE_DISABLE_KEYRING="1")
    for BM_key in list(BM_env):
        if BM_key in ("GOOSE_PROVIDER", "GOOSE_MODEL") or BM_key.startswith("GOOSE_SUBAGENT_"):
            BM_env.pop(BM_key)
    return BM_env


def BM_goose_probe(BM_data, BM_tool, BM_limit):
    BM_env = BM_environment(BM_data)
    BM_extension = shlex.join([BM_key + "=" + BM_env[BM_key] for BM_key in
        ("BM_DOUYIN_BROWSER_CONFIG", "BM_DOUYIN_ACCOUNT_OUTPUT", "BM_DOUYIN_WORKS_OUTPUT")] +
        [BM_data["BM_python_bin"], "-B", str(BM_APP / "BM_scripts" / "BM_mcp_server.py")])
    BM_name = "BM_check_account" if BM_tool == "account" else "BM_list_works"
    with tempfile.NamedTemporaryFile(mode="w", prefix="BM_probe_", suffix=".json",
            dir=Path(BM_data["BM_data_dir"]) / "BM_results", delete=False) as BM_file:
        json.dump({"steps": [{"action": "listTools"}, {"action": "callTool", "name": BM_name,
            "arguments": {"BM_limit": BM_limit} if BM_tool == "works" else {}}]}, BM_file)
        BM_script = Path(BM_file.name)
    try:
        BM_result = subprocess.run([BM_data["BM_goose_bin"], "mcp-probe", BM_extension,
            "--script", str(BM_script)], env=BM_env, cwd=BM_data["BM_data_dir"],
            capture_output=True, text=True, timeout=60, check=False)
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


def BM_main():
    BM_parser = argparse.ArgumentParser(prog="BM_douyin", description=__doc__)
    BM_parser.add_argument("--local-dir", type=Path, default=Path(os.environ.get("BM_DOUYIN_LOCAL_DIR", str(BM_DEFAULT_LOCAL))))
    BM_commands = BM_parser.add_subparsers(dest="command", required=True)
    BM_prepare_parser = BM_commands.add_parser("prepare", help="Prepare local configuration and CLI entry")
    BM_prepare_parser.add_argument("--open-browser", action="store_true")
    BM_commands.add_parser("doctor", help="Check local tool dependencies without a model")
    BM_browser_parser = BM_commands.add_parser("browser").add_subparsers(dest="action", required=True)
    BM_browser_parser.add_parser("open")
    BM_browser_parser.add_parser("close")
    BM_commands.add_parser("account").add_subparsers(dest="action", required=True).add_parser("check")
    BM_works_parser = BM_commands.add_parser("works").add_subparsers(dest="action", required=True).add_parser("list")
    BM_works_parser.add_argument("--limit", type=int, choices=range(1, 11), default=3)
    BM_probe_parser = BM_commands.add_parser("goose").add_subparsers(dest="action", required=True).add_parser("probe")
    BM_probe_parser.add_argument("tool", choices=["account", "works"], default="account", nargs="?")
    BM_probe_parser.add_argument("--limit", type=int, choices=range(1, 11), default=3)
    BM_commands.add_parser("mcp").add_subparsers(dest="action", required=True).add_parser("serve")
    BM_args = BM_parser.parse_args()
    try:
        if BM_args.command == "prepare":
            BM_data, BM_report = BM_prepare(BM_args.local_dir)
            if BM_report["BM_ready"] and BM_args.open_browser:
                BM_report.update(BM_browser_open(BM_data))
        else:
            BM_data = BM_config(BM_args.local_dir)
            if BM_args.command == "doctor":
                BM_report = BM_doctor(BM_data)
            elif BM_args.command == "browser":
                if BM_args.action == "open":
                    BM_report = BM_browser_open(BM_data)
                else:
                    BM_result = BM_browser_command(BM_data, ["close"])
                    if BM_result.returncode: raise RuntimeError("Browser close failed.")
                    BM_report = {"BM_browser_closed": True}
            elif BM_args.command == "account":
                BM_account = BM_read_account(BM_data["BM_browser_config"])
                BM_save_private(Path(BM_data["BM_data_dir"]) / "BM_results" / "BM_account.local.json", BM_account)
                BM_report = {"BM_status": BM_account["BM_status"], "BM_fields_present":
                    [BM_key for BM_key in ("BM_display_name", "BM_douyin_id") if BM_key in BM_account], "BM_private_result_saved": True}
            elif BM_args.command == "works":
                BM_works = BM_read_works(BM_data["BM_browser_config"], BM_args.limit)
                BM_save_private(Path(BM_data["BM_data_dir"]) / "BM_results" / "BM_works.local.json", BM_works)
                BM_report = BM_works_summary(BM_works, True)
            elif BM_args.command == "goose":
                BM_report = BM_goose_probe(BM_data, BM_args.tool, BM_args.limit)
            else:
                os.chdir(BM_data["BM_data_dir"])
                os.execve(BM_data["BM_python_bin"], [BM_data["BM_python_bin"], "-B",
                    str(BM_APP / "BM_scripts" / "BM_mcp_server.py")], BM_environment(BM_data))
                return 1
        print(json.dumps(BM_report, ensure_ascii=False, indent=2))
        if BM_report.get("BM_ready") is False: return 2
        if "BM_status" in BM_report and BM_report["BM_status"] not in {"authenticated", "ready", "no_items_visible"}: return 2
        return 0
    except (OSError, ValueError, TypeError, KeyError, AttributeError, RuntimeError, subprocess.TimeoutExpired):
        print("Local command failed. Check BM_config.local.json, private permissions and dependencies; run prepare or doctor locally.", file=sys.stderr)
        return 1
