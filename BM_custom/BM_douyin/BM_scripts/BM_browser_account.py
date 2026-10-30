#!/usr/bin/env python3
"""Read the creator homepage account header through an existing Playwright CLI session."""
import argparse
import datetime
import json
import os
from pathlib import Path
import stat
import subprocess
import sys
import tempfile


BM_REPOSITORY = Path(__file__).resolve().parents[3]
BM_READ_ACCOUNT = r"""async (BM_page) => {
  const BM_url = new URL(BM_page.url());
  if (BM_url.origin !== 'https://creator.douyin.com') {
    return {BM_status: 'unsupported_page'};
  }
  const BM_label = BM_page.locator('main').getByText(/^抖音号[：:]/);
  const BM_count = await BM_label.count();
  if (BM_count === 0) {
    const BM_login = BM_page.getByRole('button', {name: /登录/});
    for (let BM_index = 0; BM_index < await BM_login.count(); BM_index++) {
      if (await BM_login.nth(BM_index).isVisible()) return {BM_status: 'login_required'};
    }
    return {BM_status: 'unsupported_page'};
  }
  if (BM_count !== 1 || !await BM_label.isVisible()) return {BM_status: 'ambiguous_layout'};
  const BM_account = await BM_label.evaluate(BM_element => {
    const BM_buttons = BM_element.parentElement?.querySelectorAll('button');
    if (!BM_buttons || BM_buttons.length !== 1) return null;
    const BM_display_name = BM_buttons[0].textContent.trim();
    const BM_douyin_id = BM_element.textContent.replace(/^抖音号[：:]\s*/, '').trim();
    if (!BM_display_name || !BM_douyin_id) return null;
    return {BM_display_name, BM_douyin_id};
  });
  if (!BM_account) return {BM_status: 'ambiguous_layout'};
  return {BM_status: 'authenticated', BM_source_url: BM_url.origin + BM_url.pathname, ...BM_account};
}"""


def BM_private_path(BM_value):
    BM_path = Path(BM_value).expanduser().resolve()
    if BM_path == BM_REPOSITORY or BM_REPOSITORY in BM_path.parents:
        raise ValueError("Private configuration and results must be outside the repository.")
    return BM_path


def BM_read_account(BM_config_path):
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
    BM_result = subprocess.run([
        BM_config["BM_node_bin"], BM_config["BM_cli_script"],
        "-s=" + BM_config["BM_session"], "--json", "run-code", BM_READ_ACCOUNT,
    ], cwd=BM_workspace, capture_output=True, text=True, timeout=40, check=False)
    if BM_result.returncode:
        raise RuntimeError("Browser tool failed; ensure the dedicated session is open.")
    BM_envelope = json.loads(BM_result.stdout)
    BM_account = BM_envelope.get("result")
    if isinstance(BM_account, str):
        BM_account = json.loads(BM_account)
    if not isinstance(BM_account, dict):
        raise ValueError("Browser tool returned an unexpected response.")
    BM_status = BM_account.get("BM_status")
    if BM_status not in {"authenticated", "login_required", "unsupported_page", "ambiguous_layout"}:
        raise ValueError("Browser tool returned an unexpected status.")
    BM_report = {"BM_status": BM_status, "BM_observed_at": datetime.datetime.now(datetime.timezone.utc).isoformat()}
    if BM_status == "authenticated":
        for BM_field in ("BM_display_name", "BM_douyin_id", "BM_source_url"):
            if not isinstance(BM_account.get(BM_field), str) or not BM_account[BM_field]:
                raise ValueError("Authenticated account header is incomplete.")
            BM_report[BM_field] = BM_account[BM_field]
    return BM_report


def BM_save_private(BM_output, BM_report):
    BM_path = BM_private_path(BM_output)
    if not BM_path.parent.is_dir() or stat.S_IMODE(BM_path.parent.stat().st_mode) & 0o077:
        raise ValueError("Output directory must exist with mode 0700 or stricter.")
    with tempfile.NamedTemporaryFile(mode="w", prefix="BM_account_", dir=BM_path.parent, delete=False) as BM_file:
        BM_temporary = Path(BM_file.name)
        try:
            BM_file.write(json.dumps(BM_report, ensure_ascii=False, indent=2) + "\n")
            BM_file.flush()
            os.replace(BM_temporary, BM_path)
        finally:
            BM_temporary.unlink(missing_ok=True)


def BM_main():
    BM_parser = argparse.ArgumentParser(description=__doc__)
    BM_parser.add_argument("--config", required=True, type=Path)
    BM_parser.add_argument("--output", type=Path, help="Optional private result file outside the checkout")
    BM_args = BM_parser.parse_args()
    try:
        if BM_args.output:
            BM_private_path(BM_args.output)
        BM_report = BM_read_account(BM_args.config)
        if BM_args.output:
            BM_save_private(BM_args.output, BM_report)
    except (OSError, ValueError, TypeError, AttributeError, RuntimeError, subprocess.TimeoutExpired):
        print("Account check failed. Check the private configuration, directory permissions and browser session locally.", file=sys.stderr)
        return 1
    print(json.dumps({"BM_status": BM_report["BM_status"],
                      "BM_fields_present": [BM_field for BM_field in ("BM_display_name", "BM_douyin_id") if BM_field in BM_report],
                      "BM_private_result_saved": BM_args.output is not None}, indent=2))
    return 0 if BM_report["BM_status"] == "authenticated" else 2


if __name__ == "__main__":
    sys.exit(BM_main())
