"""Authenticated loopback control; never prints configuration or credentials."""
import json
from pathlib import Path
import stat
import sys
import urllib.request


def BM_main():
    if len(sys.argv) != 3 or sys.argv[1] not in {"status", "pause", "resume"}:
        raise ValueError("Usage: BM_control.py status|pause|resume private-config.json")
    BM_path = Path(sys.argv[2])
    if stat.S_IMODE(BM_path.stat().st_mode) & 0o077:
        raise ValueError("Configuration must be private")
    BM_config = json.loads(BM_path.read_text())
    BM_port = BM_config.get("BM_port", 8791)
    if type(BM_port) is not int or not 1 <= BM_port <= 65535:
        raise ValueError("Invalid port")
    BM_action = sys.argv[1]
    BM_request = urllib.request.Request(
        f"http://127.0.0.1:{BM_port}/BM/{BM_action}",
        method="GET" if BM_action == "status" else "POST",
        headers={"Authorization": "Bearer " + BM_config["BM_admin_token"]},
    )
    BM_http = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    with BM_http.open(BM_request, timeout=30) as BM_response:
        BM_result = json.load(BM_response)
    BM_allowed = {"BM_enabled", "BM_counts", "BM_pid"}
    if not isinstance(BM_result, dict) or set(BM_result) - BM_allowed:
        raise ValueError("Unexpected service response")
    print(json.dumps(BM_result, ensure_ascii=False))


if __name__ == "__main__":
    try:
        BM_main()
    except Exception:
        print("Control failed; check private configuration and service status.", file=sys.stderr)
        sys.exit(1)
