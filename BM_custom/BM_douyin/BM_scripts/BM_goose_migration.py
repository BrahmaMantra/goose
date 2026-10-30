"""One-time import from the legacy model file into Goose native configuration."""
import json
import stat
from urllib.parse import urlsplit

from BM_private_storage import BM_private_path


def BM_load_model(BM_path):
    BM_path = BM_private_path(BM_path)
    if stat.S_IMODE(BM_path.stat().st_mode) & 0o077:
        raise ValueError("Model configuration must be private.")
    BM_data = json.loads(BM_path.read_text())
    if not isinstance(BM_data, dict) or set(BM_data) != {"BM_api_base_url", "BM_model", "BM_api_key"}:
        raise ValueError("Invalid model configuration.")
    if any(not isinstance(BM_value, str) or not BM_value.strip() for BM_value in BM_data.values()):
        raise ValueError("Model configuration is incomplete.")
    BM_url = urlsplit(BM_data["BM_api_base_url"])
    if (BM_url.scheme != "https" or BM_url.netloc != "api.deepseek.com"
            or BM_url.path not in ("", "/", "/v1", "/v1/") or BM_url.query or BM_url.fragment):
        raise ValueError("This entrypoint supports the official DeepSeek API only.")
    return BM_data
