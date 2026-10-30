#!/usr/bin/env python3
"""Read the creator homepage account header through an existing Playwright CLI session."""
import argparse
import datetime
import json
from pathlib import Path
import subprocess
import sys


from BM_browser_session import BM_REPOSITORY, BM_call_browser, BM_private_path, BM_save_private
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


def BM_read_account(BM_config_path):
    BM_account = BM_call_browser(BM_config_path, BM_READ_ACCOUNT)
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
