"""Run Goose with a native Plugin, Recipe and private model configuration."""
import datetime
import fcntl
import os
from pathlib import Path
import subprocess
import tempfile

from BM_agent_events import BM_summary
from BM_goose_setup import BM_bind_recipe, BM_goose_environment, BM_snapshot_goose
from BM_private_storage import BM_private_path, BM_save_private


def BM_run_agent(BM_data, BM_environment, BM_task, BM_timeout=180):
    if not BM_task.strip() or len(BM_task) > 4000:
        raise ValueError("Task must contain 1 to 4000 characters.")
    BM_root = BM_private_path(BM_data["BM_data_dir"])
    with (BM_root / "BM_agent.lock").open("a") as BM_lock:
        try:
            fcntl.flock(BM_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise RuntimeError("Another agent run is active.") from None
        BM_run_dir = Path(tempfile.mkdtemp(prefix="BM_agent_", dir=BM_root / "BM_results"))
        BM_state, BM_secrets = BM_snapshot_goose(BM_data, BM_run_dir)
        BM_env = BM_goose_environment(BM_environment, BM_state)
        BM_secrets.extend(BM_value for BM_key, BM_value in BM_env.items()
                          if BM_key.endswith(("_API_KEY", "_TOKEN", "_SECRET")) and BM_value)
        BM_recipe_path = BM_bind_recipe(BM_task, BM_run_dir / "BM_recipe.local.json")
        BM_command = [BM_data["BM_goose_bin"], "run", "--no-session", "--recipe", str(BM_recipe_path),
            "--max-tool-repetitions", "2", "--output-format", "stream-json"]
        with (BM_run_dir / "BM_stdout.local.jsonl").open("w") as BM_out, (BM_run_dir / "BM_stderr.local.log").open("w") as BM_err:
            os.chmod(BM_out.name, 0o600)
            os.chmod(BM_err.name, 0o600)
            BM_exit = "failed"
            try:
                BM_process = subprocess.run(BM_command, text=True, env=BM_env, cwd=BM_run_dir,
                    stdout=BM_out, stderr=BM_err, timeout=BM_timeout, umask=0o077, check=False)
                BM_exit = "completed" if BM_process.returncode == 0 else "failed"
            except subprocess.TimeoutExpired:
                BM_exit = "timeout"
            finally:
                BM_out.flush()
                BM_err.flush()
                for BM_path in (Path(BM_out.name), Path(BM_err.name)):
                    BM_text = BM_path.read_text()
                    for BM_secret in sorted(set(BM_secrets), key=len, reverse=True):
                        BM_text = BM_text.replace(BM_secret, "[REDACTED]")
                    BM_path.write_text(BM_text)
                    BM_path.chmod(0o600)
    BM_report = BM_summary((BM_run_dir / "BM_stdout.local.jsonl").read_text())
    if BM_exit == "completed" and any(BM_result.get("BM_status") in {
            "tool_error", "unexpected_tool_result", "not_configured", "login_required", "unsupported_page", "ambiguous_layout"}
            for BM_result in BM_report["BM_tool_results"]):
        BM_exit = "tool_failed"
    BM_report.update(BM_run_status=BM_exit, BM_observed_at=datetime.datetime.now(datetime.timezone.utc).isoformat())
    if BM_exit != "completed":
        BM_report["BM_answer"] = "运行未完成；请在本地检查私有日志和模型配置。"
    if not BM_report["BM_answer"]:
        BM_report["BM_run_status"] = "incomplete"
        BM_report["BM_answer"] = "未收到最终答复；请查看本地运行记录。"
    BM_save_private(BM_run_dir / "BM_agent.local.json", BM_report)
    BM_save_private(BM_root / "BM_results" / "BM_agent.local.json", BM_report)
    return BM_report
