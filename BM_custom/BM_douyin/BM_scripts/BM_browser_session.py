"""Validated configuration and locked transport for browser read operations."""
import json
import fcntl
import stat
import subprocess

from BM_private_storage import BM_private_path


def BM_load_browser_config(BM_config_path):
    BM_path = BM_private_path(BM_config_path)
    if stat.S_IMODE(BM_path.stat().st_mode) & 0o077:
        raise ValueError("Private configuration must have mode 0600 or stricter.")
    BM_config = json.loads(BM_path.read_text())
    BM_required = {"BM_node_bin", "BM_cli_script", "BM_workspace", "BM_session"}
    if (not isinstance(BM_config, dict) or set(BM_config) != BM_required
            or any(not isinstance(BM_value, str) or not BM_value for BM_value in BM_config.values())):
        raise ValueError("Invalid browser configuration.")
    BM_workspace = BM_private_path(BM_config["BM_workspace"])
    if not BM_workspace.is_dir() or stat.S_IMODE(BM_workspace.stat().st_mode) & 0o077:
        raise ValueError("Private browser workspace must have mode 0700 or stricter.")
    return BM_config


def BM_call_browser(BM_config_path, BM_script):
    BM_config = BM_load_browser_config(BM_config_path)
    BM_workspace = BM_private_path(BM_config["BM_workspace"])
    with (BM_workspace / "BM_browser.lock").open("a") as BM_lock:
        try:
            fcntl.flock(BM_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError("Another BM_ browser operation is running; retry after it finishes.") from None
        BM_result = subprocess.run([
            BM_config["BM_node_bin"], BM_config["BM_cli_script"],
            "-s=" + BM_config["BM_session"], "--json", "run-code", BM_script,
        ], cwd=BM_workspace, capture_output=True, text=True, timeout=40, check=False)
    if BM_result.returncode:
        raise RuntimeError("Browser tool failed; ensure the dedicated session is open.")
    BM_envelope = json.loads(BM_result.stdout)
    if not isinstance(BM_envelope, dict) or BM_envelope.get("isError"):
        raise RuntimeError("Browser tool reported an error.")
    BM_report = BM_envelope.get("result")
    if isinstance(BM_report, str):
        BM_report = json.loads(BM_report)
    if not isinstance(BM_report, dict):
        raise ValueError("Browser tool returned an unexpected response.")
    return BM_report
