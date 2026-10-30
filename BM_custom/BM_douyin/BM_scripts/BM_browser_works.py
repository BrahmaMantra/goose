#!/usr/bin/env python3
"""Read a bounded set of rendered creator-center work cards without account writes."""
import argparse
import datetime
import json
from pathlib import Path
import subprocess
import sys

from BM_browser_session import BM_call_browser, BM_private_path, BM_save_private


BM_MAX_WORKS = 10
BM_READ_WORKS = r"""async (BM_page) => {
  const BM_limit = __BM_LIMIT__;
  const BM_url = new URL(BM_page.url());
  if (BM_url.origin !== 'https://creator.douyin.com') return {BM_status:'unsupported_page'};
  if (!['/', '/creator-micro/home', '/creator-micro/content/manage'].includes(BM_url.pathname)) return {BM_status:'unsupported_page'};
  if (BM_url.pathname !== '/creator-micro/content/manage') {
    const BM_menu = BM_page.getByRole('menuitem', {name:'内容管理', exact:true});
    if (await BM_menu.count() !== 1 || !await BM_menu.isVisible()) return {BM_status:'unsupported_page'};
    await BM_menu.click();
    await BM_page.waitForURL(BM_destination => BM_destination.origin === 'https://creator.douyin.com' && BM_destination.pathname === '/creator-micro/content/manage', {timeout:10000});
  }
  const BM_list = BM_page.locator('div[class*="manage-v2-list-"]');
  if (await BM_list.count() > 1) return {BM_status:'ambiguous_layout'};
  try { await BM_list.waitFor({state:'visible',timeout:8000}); } catch {
    const BM_login = BM_page.getByRole('button',{name:/登录/});
    for (let BM_index=0;BM_index<await BM_login.count();BM_index++) {
      if (await BM_login.nth(BM_index).isVisible()) return {BM_status:'login_required'};
    }
    return {BM_status:'unsupported_page'};
  }
  if (await BM_list.count() !== 1) return {BM_status:'ambiguous_layout'};
  const BM_cards = BM_list.locator('div[class*="video-card-v2-"]');
  try { await BM_cards.first().waitFor({state:'attached',timeout:5000}); } catch {
    return {BM_status:'no_items_visible',BM_items:[],BM_more_loaded:false};
  }
  const BM_items = [];
  let BM_more_loaded = false;
  for (let BM_index=0;BM_index<await BM_cards.count();BM_index++) {
    const BM_card = BM_cards.nth(BM_index);
    if (!await BM_card.isVisible()) continue;
    if (BM_items.length === BM_limit) {BM_more_loaded=true;break;}
    const BM_item = await BM_card.evaluate(BM_element => {
      const BM_titles = BM_element.querySelectorAll('[class*="info-title-text-"]');
      const BM_times = BM_element.querySelectorAll('[class*="info-time-"]');
      const BM_statuses = BM_element.querySelectorAll('[class*="info-status-"]');
      if (BM_titles.length !== 1 || BM_times.length > 1 || BM_statuses.length > 1) return null;
      const BM_title = BM_titles[0].textContent.trim();
      if (!BM_title) return null;
      const BM_title_chars = Array.from(BM_title);
      return {
        BM_title_text:BM_title_chars.slice(0,500).join(''),
        BM_title_truncated:BM_title_chars.length>500,
        BM_publish_time_text:Array.from(BM_times[0]?.textContent?.trim() || '').slice(0,100).join('') || null,
        BM_status_text:Array.from(BM_statuses[0]?.textContent?.trim() || '').slice(0,100).join('') || null
      };
    });
    if (!BM_item) return {BM_status:'ambiguous_layout'};
    BM_items.push(BM_item);
  }
  return {BM_status:BM_items.length?'ready':'no_items_visible',BM_items,BM_more_loaded};
}"""


def BM_read_works(BM_config_path, BM_limit=3):
    if type(BM_limit) is not int or not 1 <= BM_limit <= BM_MAX_WORKS:
        raise ValueError("Work limit must be an integer between 1 and 10.")
    BM_data = BM_call_browser(BM_config_path, BM_READ_WORKS.replace("__BM_LIMIT__", str(BM_limit)))
    BM_status = BM_data.get("BM_status")
    if BM_status not in {"ready", "no_items_visible", "unsupported_page", "ambiguous_layout", "login_required"}:
        raise ValueError("Unexpected works page status.")
    BM_report = {"BM_status": BM_status, "BM_scope": "current_loaded_list", "BM_complete": False,
                 "BM_observed_at": datetime.datetime.now(datetime.timezone.utc).isoformat(), "BM_items": []}
    if BM_status not in {"ready", "no_items_visible"}:
        return BM_report
    BM_items = BM_data.get("BM_items")
    if not isinstance(BM_items, list) or len(BM_items) > BM_limit or not isinstance(BM_data.get("BM_more_loaded"), bool):
        raise ValueError("Unexpected bounded works response.")
    if (BM_status == "ready") != bool(BM_items):
        raise ValueError("Works status disagrees with returned items.")
    for BM_item in BM_items:
        if not isinstance(BM_item, dict):
            raise ValueError("Unexpected work card.")
        BM_title = BM_item.get("BM_title_text")
        if not isinstance(BM_title, str) or not BM_title or len(BM_title) > 500 or not isinstance(BM_item.get("BM_title_truncated"), bool):
            raise ValueError("Unexpected work title.")
        BM_clean = {"BM_title_text": BM_title, "BM_title_truncated": BM_item["BM_title_truncated"]}
        for BM_field in ("BM_publish_time_text", "BM_status_text"):
            BM_value = BM_item.get(BM_field)
            if BM_value is not None and (not isinstance(BM_value, str) or len(BM_value) > 100):
                raise ValueError("Unexpected work label.")
            BM_clean[BM_field] = BM_value
        BM_report["BM_items"].append(BM_clean)
    BM_report["BM_more_loaded"] = BM_data["BM_more_loaded"]
    return BM_report


def BM_works_summary(BM_report, BM_saved=False):
    return {"BM_status": BM_report["BM_status"], "BM_scope": BM_report["BM_scope"],
            "BM_complete": False, "BM_items_read": len(BM_report["BM_items"]),
            "BM_more_loaded": BM_report.get("BM_more_loaded"), "BM_private_result_saved": BM_saved}


def BM_main():
    BM_parser = argparse.ArgumentParser(description=__doc__)
    BM_parser.add_argument("--config", required=True, type=Path)
    BM_parser.add_argument("--limit", type=int, default=3)
    BM_parser.add_argument("--output", type=Path)
    BM_args = BM_parser.parse_args()
    try:
        if BM_args.output:
            BM_private_path(BM_args.output)
        BM_report = BM_read_works(BM_args.config, BM_args.limit)
        if BM_args.output:
            BM_save_private(BM_args.output, BM_report)
    except (OSError, ValueError, TypeError, AttributeError, RuntimeError, subprocess.TimeoutExpired):
        print("Works check failed. Inspect the private configuration, permissions and browser locally.", file=sys.stderr)
        return 1
    print(json.dumps(BM_works_summary(BM_report, BM_args.output is not None), indent=2))
    return 0 if BM_report["BM_status"] in {"ready", "no_items_visible"} else 2


if __name__ == "__main__":
    sys.exit(BM_main())
