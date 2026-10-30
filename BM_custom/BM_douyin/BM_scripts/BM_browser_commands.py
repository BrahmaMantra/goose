"""Open, reuse and invoke the configured Playwright browser session."""
import json
from pathlib import Path
import re
import subprocess

from BM_browser_session import BM_load_browser_config
from BM_local_config import BM_private_directory
from BM_private_storage import BM_save_private


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
