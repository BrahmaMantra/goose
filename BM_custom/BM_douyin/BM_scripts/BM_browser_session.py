"""Shared private storage and transport for fixed browser read operations."""
import json
import fcntl
import os
from pathlib import Path
import stat
import subprocess
import tempfile


BM_REPOSITORY = Path(__file__).resolve().parents[3]


def BM_private_path(BM_value):
    BM_path = Path(BM_value).expanduser().resolve()
    if BM_path == BM_REPOSITORY or BM_REPOSITORY in BM_path.parents:
        raise ValueError("Private configuration and results must be outside the repository.")
    return BM_path


def BM_call_browser(BM_config_path, BM_script):
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


def BM_save_private(BM_output, BM_report):
    BM_path = BM_private_path(BM_output)
    if not BM_path.parent.is_dir() or stat.S_IMODE(BM_path.parent.stat().st_mode) & 0o077:
        raise ValueError("Output directory must exist with mode 0700 or stricter.")
    with tempfile.NamedTemporaryFile(mode="w", prefix="BM_result_", dir=BM_path.parent, delete=False) as BM_file:
        BM_temporary = Path(BM_file.name)
        try:
            BM_file.write(json.dumps(BM_report, ensure_ascii=False, indent=2) + "\n")
            BM_file.flush()
            os.replace(BM_temporary, BM_path)
        finally:
            BM_temporary.unlink(missing_ok=True)
