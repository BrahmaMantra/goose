"""Prepare a native Goose Plugin and private configuration snapshots."""
import fcntl
import json
import os
from pathlib import Path
import re
import shutil
import stat
import subprocess
import tempfile

from BM_private_storage import BM_private_path, BM_save_private, BM_write_private_text


BM_APP = Path(__file__).resolve().parents[1]
BM_PLUGIN = BM_APP / "BM_plugin"
BM_RECIPE = BM_APP / "BM_recipes" / "BM_readonly.json"


def BM_bind_recipe(BM_task, BM_path):
    BM_recipe = json.loads(BM_RECIPE.read_text())
    BM_recipe["prompt"] = BM_task
    BM_recipe.pop("parameters", None)
    BM_text = json.dumps(BM_recipe, ensure_ascii=False, indent=2)
    # JSON string escapes keep task braces out of Goose's template source.
    BM_text = re.sub(r'"(?:\\.|[^"\\])*"', lambda BM_match:
                    BM_match.group().replace("{", r"\u007b").replace("}", r"\u007d"), BM_text)
    BM_write_private_text(BM_path, BM_text + "\n")
    return BM_path


def BM_directory(BM_path):
    BM_path = BM_private_path(BM_path)
    BM_path.mkdir(parents=True, exist_ok=True, mode=0o700)
    BM_path.chmod(0o700)
    return BM_path


def BM_read_yaml(BM_data, BM_path):
    BM_path = BM_private_path(BM_path)
    if not BM_path.exists():
        return {}
    if stat.S_IMODE(BM_path.stat().st_mode) & 0o077:
        raise ValueError("Goose configuration must be private.")
    BM_result = subprocess.run([BM_data["BM_python_bin"], "-B", "-c",
        "import json,sys,yaml; json.dump(yaml.safe_load(sys.stdin) or {},sys.stdout)"],
        input=BM_path.read_text(), capture_output=True, text=True, timeout=10, check=False)
    if BM_result.returncode:
        raise ValueError("Cannot read native Goose YAML; check permissions and install BM_requirements.txt.")
    BM_value = json.loads(BM_result.stdout)
    if not isinstance(BM_value, dict):
        raise ValueError("Goose configuration must be a mapping.")
    return BM_value


def BM_install_plugin(BM_data, BM_state):
    BM_directory(BM_state / ".agents")
    BM_parent = BM_directory(BM_state / ".agents" / "plugins")
    BM_destination = BM_parent / "BM_douyin"
    BM_temporary = Path(tempfile.mkdtemp(prefix="BM_install_", dir=BM_state))
    BM_backup = BM_state / (BM_temporary.name + "_previous")
    try:
        shutil.copytree(BM_PLUGIN, BM_temporary, dirs_exist_ok=True, ignore=shutil.ignore_patterns("__pycache__"))
        BM_temporary.chmod(0o700)
        for BM_path in BM_temporary.rglob("*"):
            BM_path.chmod(0o700 if BM_path.is_dir() else 0o600)
        BM_root = BM_private_path(BM_data["BM_data_dir"])
        BM_save_private(BM_temporary / "BM_runtime.local.json", {
            "BM_python_bin": BM_data["BM_python_bin"],
            "BM_mcp_script": str(BM_APP / "BM_scripts" / "BM_mcp_server.py"),
            "BM_environment": {
                "BM_DOUYIN_BROWSER_CONFIG": BM_data["BM_browser_config"],
                "BM_DOUYIN_ACCOUNT_OUTPUT": str(BM_root / "BM_results" / "BM_account.local.json"),
                "BM_DOUYIN_WORKS_OUTPUT": str(BM_root / "BM_results" / "BM_works.local.json"),
            },
        })
        if BM_destination.exists():
            os.replace(BM_destination, BM_backup)
        try:
            os.replace(BM_temporary, BM_destination)
        except OSError:
            if BM_backup.exists():
                os.replace(BM_backup, BM_destination)
            raise
    finally:
        shutil.rmtree(BM_temporary, ignore_errors=True)
        shutil.rmtree(BM_backup, ignore_errors=True)
    return BM_destination


def BM_prepare_goose(BM_data):
    BM_root = BM_private_path(BM_data["BM_data_dir"])
    BM_state = BM_directory(BM_root / "BM_goose_state")
    with (BM_root / "BM_goose_setup.lock").open("a") as BM_lock:
        fcntl.flock(BM_lock, fcntl.LOCK_EX)
        BM_config_dir = BM_directory(BM_state / "config")
        BM_config_path = BM_config_dir / "config.yaml"
        # Native CLI versions may rewrite config permissions; this directory is application-owned.
        for BM_path in (BM_config_path, BM_config_dir / "secrets.yaml"):
            if BM_path.exists():
                BM_path.chmod(0o600)
        BM_config = BM_read_yaml(BM_data, BM_config_path)
        BM_migrated = False
        BM_legacy = BM_root / "BM_deepseek.local.json"
        if not BM_config.get("GOOSE_PROVIDER") and not BM_config.get("GOOSE_MODEL") and BM_legacy.exists():
            from BM_goose_migration import BM_load_model
            BM_model = BM_load_model(BM_legacy)
            BM_secrets_path = BM_config_dir / "secrets.yaml"
            BM_secrets = BM_read_yaml(BM_data, BM_secrets_path)
            if "DEEPSEEK_API_KEY" not in BM_secrets:
                BM_secrets["DEEPSEEK_API_KEY"] = BM_model["BM_api_key"]
                BM_save_private(BM_secrets_path, BM_secrets)
            BM_config.update(GOOSE_PROVIDER="custom_deepseek", GOOSE_MODEL=BM_model["BM_model"])
            BM_migrated = True
        if BM_migrated or not BM_config_path.exists():
            BM_save_private(BM_config_path, BM_config)
        BM_install_plugin(BM_data, BM_root)
    return {"BM_plugin_prepared": True, "BM_legacy_model_imported": BM_migrated,
            "BM_model_configured": bool(BM_config.get("GOOSE_PROVIDER") and BM_config.get("GOOSE_MODEL"))}


def BM_snapshot_goose(BM_data, BM_run_dir):
    BM_root = BM_private_path(BM_data["BM_data_dir"])
    BM_source = BM_root / "BM_goose_state" / "config"
    BM_config = BM_read_yaml(BM_data, BM_source / "config.yaml")
    if not BM_config.get("GOOSE_PROVIDER") or not BM_config.get("GOOSE_MODEL"):
        raise ValueError("Configure a model with BM_douyin goose configure first.")
    BM_secrets = BM_read_yaml(BM_data, BM_source / "secrets.yaml")
    BM_state = BM_directory(BM_run_dir / "BM_goose_state")
    BM_config_dir = BM_directory(BM_state / "config")
    # Preserve native model configuration; the run's extensions come only from this Plugin.
    BM_policy = json.loads((BM_PLUGIN / "BM_policy.json").read_text())
    BM_config["extensions"] = {BM_name: {"enabled": False, "type": "platform", "name": BM_name,
        "description": "", "available_tools": []} for BM_name in BM_policy["BM_disabled_extensions"]}
    BM_config["plugins"] = {}
    BM_save_private(BM_config_dir / "config.yaml", BM_config)
    BM_save_private(BM_config_dir / "secrets.yaml", BM_secrets)
    BM_install_plugin(BM_data, BM_run_dir)
    return BM_state, [BM_value for BM_value in BM_secrets.values() if isinstance(BM_value, str) and BM_value]


def BM_goose_environment(BM_environment, BM_state):
    BM_env = BM_environment.copy()
    for BM_key in list(BM_env):
        if BM_key.startswith(("GOOSE_", "OTEL_", "LANGFUSE_")) or BM_key in {"EXTENSIONS", "PLUGINS"}:
            BM_env.pop(BM_key)
    BM_env.update(GOOSE_PATH_ROOT=str(BM_state), GOOSE_TELEMETRY_ENABLED="false",
                  GOOSE_DISABLE_KEYRING="1", GOOSE_MAX_TOKENS="512")
    return BM_env
