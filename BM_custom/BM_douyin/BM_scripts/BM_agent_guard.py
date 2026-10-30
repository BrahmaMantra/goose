#!/usr/bin/env python3
"""Compatibility entrypoint for the native Plugin's policy Hook."""
from pathlib import Path
import sys

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "BM_plugin" / "BM_scripts"))
from BM_guard import BM_decision, BM_main


if __name__ == "__main__":
    sys.exit(BM_main())
