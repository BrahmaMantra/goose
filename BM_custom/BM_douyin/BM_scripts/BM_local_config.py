"""Local CLI configuration, preparation, dependency checks and runtime environment."""
import json
import os
from pathlib import Path
import shlex
import stat
import subprocess
import sys
import tempfile

from BM_browser_session import BM_load_browser_config
from BM_private_storage import BM_REPOSITORY, BM_private_path, BM_save_private


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
    BM_checks["BM_yaml"] = False
    if BM_checks["BM_python"]:
        BM_probe = subprocess.run([BM_data["BM_python_bin"], "-B", "-c",
            "import importlib.util,json; print(json.dumps([importlib.util.find_spec('mcp') is not None, importlib.util.find_spec('yaml') is not None]))"],
            capture_output=True, text=True, timeout=10, check=False)
        if BM_probe.returncode == 0:
            BM_checks["BM_mcp_sdk"], BM_checks["BM_yaml"] = json.loads(BM_probe.stdout)
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
    from BM_goose_setup import BM_prepare_goose
    if BM_status["BM_ready"]:
        BM_status.update(BM_prepare_goose(BM_data))
    BM_status.update(BM_local_dir=str(BM_root), BM_cli_entry=str(BM_launcher))
    return BM_data, BM_status


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
