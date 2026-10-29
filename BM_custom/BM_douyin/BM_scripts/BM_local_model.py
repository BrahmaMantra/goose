#!/usr/bin/env python3
"""Run Goose with the existing Ollama/MLX model, without kernel changes."""
import argparse
import fcntl
import hashlib
import json
import os
from pathlib import Path
import shlex
import shutil
import subprocess
import sys
import tempfile
import urllib.error
import urllib.parse
import urllib.request


BM_DEFAULT_MODEL = os.environ.get("BM_LOCAL_MODEL")


def BM_arguments():
    BM_parser = argparse.ArgumentParser(description=__doc__)
    BM_parser.add_argument("action", choices=["check", "env", "serve", "prepare", "run"])
    BM_parser.add_argument("--model", default=BM_DEFAULT_MODEL)
    BM_parser.add_argument("--context", type=int, choices=[4096, 8192], default=4096)
    BM_parser.add_argument("--max-output", type=int, default=256)
    BM_parser.add_argument("--max-turns", type=int, default=4)
    BM_parser.add_argument("--ollama-url", default="http://127.0.0.1:11434")
    BM_parser.add_argument("--ollama-bin", default="ollama")
    BM_parser.add_argument("--goose-bin", default="goose")
    BM_parser.add_argument("--dry-run", action="store_true", help="Print the plan without network requests, model changes, or execution")
    BM_args, BM_extra = BM_parser.parse_known_args()
    if not BM_args.model:
        BM_parser.error("Set BM_LOCAL_MODEL locally or pass --model with an installed model name")
    if BM_extra and BM_extra[0] == "--":
        BM_extra = BM_extra[1:]
    if BM_args.action != "run" and BM_extra:
        BM_parser.error("Goose arguments are accepted only by run, after --")
    if not 1 <= BM_args.max_output <= 256:
        BM_parser.error("--max-output must be between 1 and 256 for this conservative resource profile")
    if not 1 <= BM_args.max_turns <= 20:
        BM_parser.error("--max-turns must be between 1 and 20")
    BM_parsed = urllib.parse.urlsplit(BM_args.ollama_url)
    if BM_parsed.scheme not in ("http", "https") or not BM_parsed.hostname:
        BM_parser.error("--ollama-url requires a valid HTTP(S) service URL")
    if BM_parsed.username or BM_parsed.password or BM_parsed.query or BM_parsed.fragment or BM_parsed.path not in ("", "/"):
        BM_parser.error("--ollama-url must be a service origin without credentials, query, or path")
    BM_args.ollama_url = BM_args.ollama_url.rstrip("/")
    return BM_args, BM_extra


def BM_alias_for(BM_args):
    BM_identity = f"{BM_args.model}:{BM_args.context}:{BM_args.max_output}".encode()
    return "goose-local-" + hashlib.sha256(BM_identity).hexdigest()[:12]


def BM_environment(BM_args):
    return {
        "OLLAMA_HOST": BM_args.ollama_url,
        "GOOSE_PROVIDER": "ollama",
        "GOOSE_MODEL": BM_alias_for(BM_args),
        "GOOSE_INPUT_LIMIT": str(BM_args.context),
        "GOOSE_MAX_TOKENS": str(BM_args.max_output),
        "GOOSE_MAX_TURNS": str(BM_args.max_turns),
        "GOOSE_MAX_CONCURRENT_SUBAGENTS": "1",
        "GOOSE_SUBAGENT_PROVIDER": "ollama",
        "GOOSE_SUBAGENT_MODEL": BM_alias_for(BM_args),
        "GOOSE_SUBAGENT_MAX_TURNS": str(BM_args.max_turns),
    }


def BM_request(BM_args, BM_path, BM_payload=None):
    BM_body = None if BM_payload is None else json.dumps(BM_payload).encode()
    BM_req = urllib.request.Request(BM_args.ollama_url + BM_path, data=BM_body)
    if BM_body is not None:
        BM_req.add_header("Content-Type", "application/json")
    with urllib.request.urlopen(BM_req, timeout=15) as BM_response:
        return json.load(BM_response)


def BM_executable(BM_value):
    BM_path = shutil.which(BM_value)
    if BM_path is None:
        raise RuntimeError(f"Executable not found: {BM_value}. Install it or pass its path explicitly.")
    return BM_path


def BM_inventory(BM_args):
    BM_version = BM_request(BM_args, "/api/version")
    BM_models = BM_request(BM_args, "/api/tags").get("models", [])
    BM_loaded = BM_request(BM_args, "/api/ps").get("models", [])
    BM_names = {BM_model.get("name", BM_model.get("model")): BM_model for BM_model in BM_models}
    if BM_args.model not in BM_names:
        raise RuntimeError(f"Source model {BM_args.model!r} is not installed; no model will be downloaded automatically.")
    return BM_version, BM_names, BM_loaded


def BM_modelfile(BM_args):
    return f"FROM {BM_args.model}\nPARAMETER num_ctx {BM_args.context}\nPARAMETER num_predict {BM_args.max_output}\n"


def BM_main():
    BM_args, BM_extra = BM_arguments()
    BM_values = BM_environment(BM_args)
    BM_command = [BM_args.goose_bin] + (BM_extra or ["session", "--no-profile"])
    if BM_args.dry_run:
        print(json.dumps({"action": BM_args.action, "source_model": BM_args.model, "alias": BM_alias_for(BM_args),
                          "environment": BM_values, "modelfile": BM_modelfile(BM_args),
                          "goose_command": BM_command}, ensure_ascii=False, indent=2))
        return 0
    if BM_args.action == "env":
        for BM_key, BM_value in BM_values.items():
            print(f"export {BM_key}={shlex.quote(BM_value)}")
        return 0
    if BM_args.action == "serve":
        try:
            BM_request(BM_args, "/api/version")
        except urllib.error.URLError:
            pass
        else:
            raise RuntimeError("An Ollama service is already reachable. This script will not stop or reconfigure it.")
        BM_env = os.environ | {
            "OLLAMA_HOST": BM_args.ollama_url,
            "OLLAMA_FLASH_ATTENTION": "1",
            "OLLAMA_KV_CACHE_TYPE": "q8_0",
            "OLLAMA_NUM_PARALLEL": "1",
            "OLLAMA_MAX_LOADED_MODELS": "1",
            "OLLAMA_KEEP_ALIVE": "5m",
        }
        os.execve(BM_executable(BM_args.ollama_bin), [BM_args.ollama_bin, "serve"], BM_env)
    BM_version, BM_names, BM_loaded = BM_inventory(BM_args)
    if BM_args.action == "check":
        BM_source = BM_names[BM_args.model]
        print(json.dumps({"service": BM_args.ollama_url, "version": BM_version.get("version"),
                          "source_model": BM_args.model, "details": BM_source.get("details"),
                          "reported_capabilities": BM_source.get("capabilities"),
                          "context": BM_args.context, "max_output": BM_args.max_output,
                          "alias": BM_alias_for(BM_args), "alias_prepared": BM_alias_for(BM_args) in BM_names,
                          "loaded_models": BM_loaded,
                          "goose_executable": shutil.which(BM_args.goose_bin)}, ensure_ascii=False, indent=2))
        return 0
    BM_lock_path = Path(tempfile.gettempdir()) / f"goose-local-model-{os.getuid()}.lock"
    with BM_lock_path.open("a") as BM_lock:
        try:
            fcntl.flock(BM_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError as BM_error:
            raise RuntimeError("Another local-model launcher is running; only one is allowed.") from BM_error
        if BM_args.action == "prepare":
            if BM_loaded:
                raise RuntimeError("Unload resident models before preparing an alias. This script will not unload another session's model.")
            with tempfile.TemporaryDirectory(prefix="goose-local-model-") as BM_directory:
                BM_path = Path(BM_directory) / "Modelfile"
                BM_path.write_text(BM_modelfile(BM_args))
                BM_result = subprocess.run([BM_executable(BM_args.ollama_bin), "create", BM_alias_for(BM_args), "-f", str(BM_path)],
                                        env=os.environ | {"OLLAMA_HOST": BM_args.ollama_url}, check=False)
                return BM_result.returncode
        if BM_alias_for(BM_args) not in BM_names:
            raise RuntimeError("Model alias is not prepared. Run prepare with the same model/context/output options first.")
        BM_binary = BM_executable(BM_args.goose_bin)
        for BM_model in BM_loaded:
            if BM_model.get("name", BM_model.get("model")) != BM_alias_for(BM_args):
                raise RuntimeError("Another model is resident. Unload it explicitly before running Goose.")
            if BM_model.get("context_length") not in (None, BM_args.context):
                raise RuntimeError("The resident alias has a different context size. Unload it before continuing.")
        BM_child = None
        try:
            BM_child = subprocess.Popen([BM_binary] + BM_command[1:], env=os.environ | BM_values)
            return BM_child.wait()
        except KeyboardInterrupt:
            if BM_child is not None:
                BM_child.terminate()
                BM_child.wait()
            return 130
        finally:
            if BM_child is not None:
                try:
                    BM_request(BM_args, "/api/generate", {"model": BM_alias_for(BM_args), "keep_alive": 0})
                except (urllib.error.URLError, ValueError) as BM_error:
                    print(f"Could not unload {BM_alias_for(BM_args)}: {BM_error}. Unload it with ollama stop.", file=sys.stderr)


if __name__ == "__main__":
    try:
        sys.exit(BM_main())
    except (RuntimeError, urllib.error.URLError, ValueError) as BM_error:
        print(f"local-model: {BM_error}", file=sys.stderr)
        sys.exit(1)
