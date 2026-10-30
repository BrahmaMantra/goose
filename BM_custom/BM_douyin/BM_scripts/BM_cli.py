"""Standalone local CLI for the Douyin browser tools and restricted Goose agent."""
import argparse
import json
import os
from pathlib import Path
import stat
import subprocess
import sys

from BM_agent import BM_run_agent
from BM_browser_account import BM_read_account
from BM_browser_commands import BM_browser_command, BM_browser_open
from BM_browser_works import BM_read_works, BM_works_summary
from BM_goose_probe import BM_goose_probe
from BM_goose_setup import BM_RECIPE, BM_goose_environment, BM_prepare_goose
from BM_local_config import BM_APP, BM_DEFAULT_LOCAL, BM_config, BM_doctor, BM_environment, BM_prepare
from BM_private_storage import BM_private_path, BM_save_private


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
    BM_goose_commands = BM_commands.add_parser("goose").add_subparsers(dest="action", required=True)
    BM_goose_commands.add_parser("configure", help="Use native Goose configuration; may query provider metadata")
    BM_goose_commands.add_parser("validate", help="Validate the native Recipe without calling a model")
    BM_probe_parser = BM_goose_commands.add_parser("probe")
    BM_probe_parser.add_argument("tool", choices=["account", "works"], default="account", nargs="?")
    BM_probe_parser.add_argument("--limit", type=int, choices=range(1, 4), default=3)
    BM_test_parser = BM_commands.add_parser("test", help="Run synthetic regressions without a browser or model")
    BM_test_parser.add_argument("--native", action="store_true", help="Exercise real Goose against a loopback fixture")
    BM_commands.add_parser("mcp").add_subparsers(dest="action", required=True).add_parser("serve")
    BM_agent_parser = BM_commands.add_parser("agent").add_subparsers(dest="action", required=True).add_parser("run")
    BM_agent_parser.add_argument("task")
    BM_commands.add_parser("results").add_argument("kind", choices=["account", "works", "agent"])
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
                if BM_args.action == "probe":
                    BM_report = BM_goose_probe(BM_data, BM_args.tool, BM_args.limit)
                else:
                    BM_prepare_goose(BM_data)
                    BM_env = BM_goose_environment(BM_environment(BM_data), Path(BM_data["BM_data_dir"]) / "BM_goose_state")
                    BM_arguments = (["configure"] if BM_args.action == "configure" else ["recipe", "validate", str(BM_RECIPE)])
                    return subprocess.run([BM_data["BM_goose_bin"], *BM_arguments],
                        env=BM_env, cwd=BM_data["BM_data_dir"], umask=0o077, check=False).returncode
            elif BM_args.command == "test":
                BM_script = "BM_native_integration.py" if BM_args.native else "BM_regression.py"
                BM_arguments = ["--goose-bin", BM_data["BM_goose_bin"]] if BM_args.native else []
                return subprocess.run([BM_data["BM_python_bin"], "-B", str(BM_APP / "BM_tests" / BM_script), *BM_arguments],
                    check=False).returncode
            elif BM_args.command == "agent":
                BM_report = BM_run_agent(BM_data, BM_environment(BM_data), BM_args.task)
                print(BM_report["BM_answer"])
                return 0 if BM_report["BM_run_status"] == "completed" else 2
            elif BM_args.command == "results":
                BM_path = BM_private_path(Path(BM_data["BM_data_dir"]) / "BM_results" / ("BM_" + BM_args.kind + ".local.json"))
                if stat.S_IMODE(BM_path.stat().st_mode) & 0o077:
                    raise ValueError("Results file must be private.")
                BM_report = json.loads(BM_path.read_text())
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
