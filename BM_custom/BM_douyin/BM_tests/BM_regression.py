"""Run focused regressions without a browser, personal configuration or LLM calls."""
import json
from pathlib import Path
import stat
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "BM_scripts"))

import BM_agent
import BM_browser_commands
import BM_goose_probe
from BM_agent_events import BM_summary
from BM_local_config import BM_config, BM_environment
from BM_private_storage import BM_REPOSITORY, BM_private_path, BM_save_private


def BM_data(BM_root):
    return {"BM_schema": 1, "BM_data_dir": str(BM_root),
            "BM_browser_config": str(BM_root / "BM_browser.local.json"),
            "BM_python_bin": sys.executable, "BM_goose_bin": "BM_fake_goose"}


def BM_test_private_storage():
    with tempfile.TemporaryDirectory(prefix="BM_test_") as BM_directory:
        BM_root = Path(BM_directory)
        BM_output = BM_root / "BM_result.json"
        BM_save_private(BM_output, {"BM_status": "ready"})
        assert stat.S_IMODE(BM_output.stat().st_mode) == 0o600
        assert json.loads(BM_output.read_text()) == {"BM_status": "ready"}
        assert not list(BM_root.glob("BM_result_*"))
        with unittest.TestCase().assertRaises(ValueError):
            BM_private_path(BM_REPOSITORY / "BM_private")
        BM_root.chmod(0o755)
        with unittest.TestCase().assertRaises(ValueError):
            BM_save_private(BM_output, {})


def BM_test_config_and_environment():
    with tempfile.TemporaryDirectory(prefix="BM_test_") as BM_directory:
        BM_root = Path(BM_directory)
        BM_config_path = BM_root / "BM_config.local.json"
        BM_value = BM_data(BM_root)
        BM_save_private(BM_config_path, BM_value)
        assert BM_config(BM_root) == BM_value
        with patch.dict("os.environ", {"GOOSE_PROVIDER": "example", "GOOSE_MODEL": "example",
                                       "GOOSE_SUBAGENT_PROVIDER": "example"}):
            BM_env = BM_environment(BM_value)
        assert all(BM_key not in BM_env for BM_key in
                   ("GOOSE_PROVIDER", "GOOSE_MODEL", "GOOSE_SUBAGENT_PROVIDER"))
        assert BM_env["GOOSE_TELEMETRY_ENABLED"] == "false"
        BM_value["BM_schema"] = True
        BM_save_private(BM_config_path, BM_value)
        with unittest.TestCase().assertRaises(ValueError):
            BM_config(BM_root)
        BM_config_path.chmod(0o644)
        with unittest.TestCase().assertRaises(ValueError):
            BM_config(BM_root)


def BM_test_browser_reuse():
    BM_value = {"BM_browser_config": "BM_example"}
    with patch.object(BM_browser_commands, "BM_load_browser_config", return_value={"BM_session": "BM_test"}), \
            patch.object(BM_browser_commands, "BM_browser_command", return_value=subprocess.CompletedProcess(
                [], 0, "- BM_test:\n  - status: open\n", "")) as BM_command:
        assert BM_browser_commands.BM_browser_open(BM_value) == {"BM_browser_open": True, "BM_reused_session": True}
        BM_command.assert_called_once_with(BM_value, ["list"])


def BM_test_probe_boundaries():
    with tempfile.TemporaryDirectory(prefix="BM_test_") as BM_directory:
        BM_root = Path(BM_directory)
        (BM_root / "BM_results").mkdir(mode=0o700)
        BM_public = {"BM_status": "authenticated", "BM_fields_present": [], "BM_private_result_saved": True}
        BM_tool_result = {"structuredContent": BM_public}
        BM_envelope = {"results": [{"name": "BM_check_account", "result": BM_tool_result}]}
        with patch.object(BM_goose_probe.subprocess, "run") as BM_run:
            BM_run.return_value = subprocess.CompletedProcess([], 0, json.dumps(BM_envelope), "")
            assert BM_goose_probe.BM_goose_probe(BM_data(BM_root), "account", 3) == BM_public
            BM_tool_result.pop("structuredContent")
            BM_tool_result["content"] = [{"type": "text", "text": json.dumps(BM_public)}]
            BM_run.return_value.stdout = json.dumps(BM_envelope)
            assert BM_goose_probe.BM_goose_probe(BM_data(BM_root), "account", 3) == BM_public
            BM_tool_result["structuredContent"] = dict(BM_public, BM_display_name="example")
            BM_run.return_value.stdout = json.dumps(BM_envelope)
            with unittest.TestCase().assertRaises(RuntimeError):
                BM_goose_probe.BM_goose_probe(BM_data(BM_root), "account", 3)
            BM_run.side_effect = subprocess.TimeoutExpired("BM_fake_goose", 60)
            with unittest.TestCase().assertRaises(subprocess.TimeoutExpired):
                BM_goose_probe.BM_goose_probe(BM_data(BM_root), "account", 3)
        assert not list((BM_root / "BM_results").iterdir())


def BM_test_agent_events():
    BM_events = [{"message": {"id": "BM_first", "role": "assistant", "content": [
        {"type": "text", "text": "正在检查"}, {"type": "toolRequest", "toolCall": {
            "status": "success", "value": {"name": "bm_douyin__BM_check_account", "arguments": {}}}}]}},
        {"message": {"id": "BM_response", "role": "user", "content": [{"type": "toolResponse",
            "toolResult": {"status": "success", "value": {"content": [
                {"type": "text", "text": '{"BM_status": "authenticated"}'}]}}}]}},
        {"message": {"id": "BM_final", "role": "assistant", "content": [{"type": "text", "text": "已"}]}},
        {"message": {"id": "BM_final", "role": "assistant", "content": [{"type": "text", "text": "检查"}]}}]
    BM_encode = lambda BM_items: "ignored diagnostic\n" + "\n".join(json.dumps(BM_item) for BM_item in BM_items)
    assert BM_summary(BM_encode(BM_events))["BM_answer"] == "已检查"
    assert BM_summary(BM_encode(BM_events[:1]))["BM_answer"] == ""
    assert BM_summary(BM_encode(BM_events))["BM_tool_results"] == [{"BM_status": "authenticated"}]


def BM_test_agent_execution():
    for BM_timeout in (False, True):
        with tempfile.TemporaryDirectory(prefix="BM_test_") as BM_directory:
            BM_root = Path(BM_directory)
            (BM_root / "BM_results").mkdir(mode=0o700)
            BM_model = {"BM_api_base_url": "https://api.deepseek.com", "BM_model": "example", "BM_api_key": "placeholder"}
            BM_save_private(BM_root / "BM_deepseek.local.json", BM_model)

            def BM_fake_run(BM_command, **BM_options):
                BM_recipe = json.loads(Path(BM_command[BM_command.index("--recipe") + 1]).read_text())
                assert BM_recipe["extensions"][0]["available_tools"] == ["BM_check_account", "BM_list_works"]
                BM_hooks = Path(BM_options["cwd"]) / ".agents/plugins/BM_readonly/hooks/hooks.json"
                assert json.loads(BM_hooks.read_text())["hooks"]["PreToolUse"][0]["hooks"][0]["on_failure"] == "block"
                BM_options["stderr"].write("placeholder")
                BM_options["stdout"].write(json.dumps({"message": {"id": "BM_final", "role": "assistant",
                    "content": [{"type": "text", "text": "placeholder"}]}}) + "\n")
                if BM_timeout:
                    raise subprocess.TimeoutExpired(BM_command, 1)
                return subprocess.CompletedProcess(BM_command, 0)

            with patch.object(BM_agent.subprocess, "run", side_effect=BM_fake_run):
                BM_report = BM_agent.BM_run_agent(BM_data(BM_root), BM_environment(BM_data(BM_root)), "检查账号")
            assert BM_report["BM_run_status"] == ("timeout" if BM_timeout else "completed")
            assert "placeholder" not in json.dumps(BM_report)
            for BM_path in (BM_root / "BM_results").rglob("*"):
                if BM_path.is_file():
                    assert "placeholder" not in BM_path.read_text()
                    assert stat.S_IMODE(BM_path.stat().st_mode) == 0o600


if __name__ == "__main__":
    BM_suite = unittest.TestSuite(unittest.FunctionTestCase(BM_test) for BM_test in (
        BM_test_private_storage, BM_test_config_and_environment, BM_test_browser_reuse,
        BM_test_probe_boundaries, BM_test_agent_events, BM_test_agent_execution))
    BM_result = unittest.TextTestRunner(verbosity=2).run(BM_suite)
    sys.exit(0 if BM_result.wasSuccessful() else 1)
