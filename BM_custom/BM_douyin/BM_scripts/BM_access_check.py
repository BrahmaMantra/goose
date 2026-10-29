#!/usr/bin/env python3
"""Check Douyin onboarding configuration without models or platform requests."""
import argparse
import datetime
import json
import os
from pathlib import Path
import sys
import urllib.parse


BM_EXAMPLE_CONFIG = Path(__file__).resolve().parents[1] / "BM_config/BM_access.example.json"
BM_FIELDS = {
    "BM_account_type", "BM_developer_status", "BM_application_type",
    "BM_application_status", "BM_client_key", "BM_redirect_uri",
    "BM_redirect_registered", "BM_approved_scopes", "BM_requested_scopes",
    "BM_scope_verified_at",
}


def BM_config_path():
    return Path(os.environ.get("BM_DOUYIN_CONFIG", str(BM_EXAMPLE_CONFIG)))


def BM_check_access(BM_path):
    BM_config = json.loads(Path(BM_path).read_text())
    if not isinstance(BM_config, dict) or set(BM_config) - BM_FIELDS:
        raise ValueError("Use only the fields in BM_access.example.json; credentials belong outside this configuration.")
    BM_missing = []
    if BM_config.get("BM_account_type") != "ordinary_creator":
        BM_missing.append("This integration targets an ordinary creator account.")
    if BM_config.get("BM_developer_status") != "verified":
        BM_missing.append("Confirm developer onboarding is verified in the official console.")
    if BM_config.get("BM_application_type") not in ("website", "mobile"):
        BM_missing.append("Confirm website/mobile application type; other app types need their own official OAuth flow.")
    if BM_config.get("BM_application_status") != "approved":
        BM_missing.append("Confirm the application is approved in the official console.")
    BM_key = BM_config.get("BM_client_key")
    if not isinstance(BM_key, str) or not BM_key.strip() or BM_key != BM_key.strip():
        BM_missing.append("Provide the application's client_key in the local configuration.")
    BM_uri = BM_config.get("BM_redirect_uri")
    BM_valid_uri = False
    if isinstance(BM_uri, str) and BM_uri and not any(BM_char.isspace() for BM_char in BM_uri):
        try:
            BM_url = urllib.parse.urlsplit(BM_uri)
            BM_valid_uri = (BM_url.scheme == "https" and bool(BM_url.hostname)
                            and BM_url.hostname not in ("localhost", "127.0.0.1", "::1")
                            and not BM_url.username and not BM_url.password
                            and "?" not in BM_uri and "#" not in BM_uri)
            BM_url.port
        except ValueError:
            BM_valid_uri = False
    if not BM_valid_uri:
        BM_missing.append("Provide a public HTTPS callback URL without credentials, query or fragment.")
    if BM_config.get("BM_redirect_registered") is not True:
        BM_missing.append("Confirm this exact callback URL is registered for the application.")
    for BM_field in ("BM_approved_scopes", "BM_requested_scopes"):
        BM_scopes = BM_config.get(BM_field)
        if (not isinstance(BM_scopes, list)
                or any(not isinstance(BM_scope, str) or not BM_scope
                       or any(BM_char.isspace() for BM_char in BM_scope) or "," in BM_scope
                       for BM_scope in BM_scopes)):
            raise ValueError("Scope fields must be arrays of nonempty individual scope names.")
    BM_requested = set(BM_config["BM_requested_scopes"])
    if not BM_requested:
        BM_missing.append("Choose the minimal requested scopes for the first real workflow.")
    if BM_requested - set(BM_config["BM_approved_scopes"]):
        BM_missing.append("Every requested scope must appear in the application's approved scopes.")
    try:
        BM_date = datetime.date.fromisoformat(BM_config.get("BM_scope_verified_at") or "")
        if BM_date > datetime.date.today():
            raise ValueError("Verification date cannot be in the future.")
    except (TypeError, ValueError):
        BM_missing.append("Record the console permission verification date as YYYY-MM-DD.")
    return {
        "BM_config_ready": not BM_missing,
        "BM_live_access_verified": False,
        "BM_missing": BM_missing,
        "BM_next_step": ("Implement and verify the official OAuth callback and token exchange."
                         if not BM_missing else "Complete onboarding information before implementing account access."),
        "BM_note": "Configuration checks reflect supplied information; they do not verify official approval, user authorization or API access.",
    }


def BM_main():
    BM_parser = argparse.ArgumentParser(description=__doc__)
    BM_parser.add_argument("--config", type=Path, default=BM_config_path())
    BM_args = BM_parser.parse_args()
    try:
        BM_report = BM_check_access(BM_args.config)
    except (OSError, ValueError, TypeError, KeyError):
        print("Cannot validate configuration; check the local file against BM_access.example.json.", file=sys.stderr)
        return 1
    print(json.dumps(BM_report, ensure_ascii=False, indent=2))
    return 0 if BM_report["BM_config_ready"] else 2


if __name__ == "__main__":
    sys.exit(BM_main())
