"""Launch the configured business service without passing model credentials."""
import json
import os
from pathlib import Path
import stat
import sys


def BM_main():
    BM_path = Path(__file__).resolve().parents[1] / "BM_runtime.local.json"
    if stat.S_IMODE(BM_path.stat().st_mode) & 0o077:
        raise ValueError("Plugin runtime configuration must be private.")
    BM_runtime = json.loads(BM_path.read_text())
    BM_env = {BM_key: os.environ[BM_key] for BM_key in ("PATH", "LANG", "LC_ALL") if BM_key in os.environ}
    BM_env.update(BM_runtime["BM_environment"])
    BM_env["BM_DOUYIN_AGENT_MODE"] = "1"
    BM_python = BM_runtime["BM_python_bin"]
    os.execve(BM_python, [BM_python, "-B", BM_runtime["BM_mcp_script"]], BM_env)


if __name__ == "__main__":
    try:
        BM_main()
    except (OSError, ValueError, TypeError, KeyError):
        print("Plugin is not prepared; run BM_douyin prepare locally.", file=sys.stderr)
        sys.exit(1)
