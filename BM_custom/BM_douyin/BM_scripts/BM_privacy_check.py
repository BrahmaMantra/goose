#!/usr/bin/env python3
"""Review staged fork additions without printing matched private content."""
import re
import subprocess
import sys


BM_HOME_PATH = re.compile(r"(?<![A-Za-z0-9_/])/(?:Users|home)/[^/\s]+")
BM_CREDENTIAL = re.compile(
    r'''(?i)["']?(?:BM_)?(?:client_secret|access_token|refresh_token|password|api_key)["']?\s*[:=]\s*["']([^"']+)["']'''
)
BM_PLACEHOLDERS = {"example", "placeholder", "your-api-key", "your-secret", "redacted", "***", "..."}


def BM_git(*BM_arguments, BM_input=None):
    return subprocess.run(["git", *BM_arguments], input=BM_input, capture_output=True, check=False)


def BM_main():
    BM_files = BM_git("diff", "--cached", "--name-only", "--diff-filter=ACMR", "-z")
    if BM_files.returncode:
        print("Cannot inspect staged files.", file=sys.stderr)
        return 2
    BM_problems = []
    for BM_path in BM_files.stdout.split(b"\0"):
        if not BM_path:
            continue
        BM_ignored = BM_git("check-ignore", "--no-index", "--stdin", "-z", BM_input=BM_path + b"\0")
        if BM_ignored.returncode == 0:
            BM_problems.append("An ignored file was force-staged.")
            continue
        if BM_ignored.returncode != 1:
            print("Cannot evaluate ignore rules.", file=sys.stderr)
            return 2
        if not (BM_path.startswith(b"BM_custom/") or BM_path in (b"README.md", b"AGENTS.md", b".gitignore")):
            continue
        BM_diff = BM_git("diff", "--cached", "--no-ext-diff", "--unified=0", "--", BM_path.decode())
        if BM_diff.returncode:
            print("Cannot inspect staged content.", file=sys.stderr)
            return 2
        for BM_line in BM_diff.stdout.decode(errors="replace").splitlines():
            if not BM_line.startswith("+") or BM_line.startswith("+++"):
                continue
            if BM_HOME_PATH.search(BM_line):
                BM_problems.append("A staged addition contains a personal home path.")
            for BM_match in BM_CREDENTIAL.finditer(BM_line):
                if BM_match.group(1).lower() not in BM_PLACEHOLDERS:
                    BM_problems.append("A staged addition may contain a credential literal.")
    if BM_problems:
        print("Privacy review failed:")
        for BM_problem in sorted(set(BM_problems)):
            print("- " + BM_problem)
        return 1
    print("Staged privacy checks passed. Review remaining personal details and PR text manually.")
    return 0


if __name__ == "__main__":
    sys.exit(BM_main())
