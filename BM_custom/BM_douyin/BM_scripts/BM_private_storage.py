"""Repository-external private paths and atomic JSON storage."""
import json
import os
from pathlib import Path
import stat
import tempfile


BM_REPOSITORY = Path(__file__).resolve().parents[3]


def BM_private_path(BM_value):
    BM_path = Path(BM_value).expanduser().resolve()
    if BM_path == BM_REPOSITORY or BM_REPOSITORY in BM_path.parents:
        raise ValueError("Private configuration and results must be outside the repository.")
    return BM_path


def BM_save_private(BM_output, BM_report):
    BM_path = BM_private_path(BM_output)
    if not BM_path.parent.is_dir() or stat.S_IMODE(BM_path.parent.stat().st_mode) & 0o077:
        raise ValueError("Output directory must exist with mode 0700 or stricter.")
    with tempfile.NamedTemporaryFile(mode="w", prefix="BM_result_", dir=BM_path.parent, delete=False) as BM_file:
        BM_temporary = Path(BM_file.name)
        try:
            BM_file.write(json.dumps(BM_report, ensure_ascii=False, indent=2) + "\n")
            BM_file.flush()
            os.replace(BM_temporary, BM_path)
        finally:
            BM_temporary.unlink(missing_ok=True)
