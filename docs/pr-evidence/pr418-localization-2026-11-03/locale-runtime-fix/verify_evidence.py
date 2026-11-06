#!/usr/bin/env python3
"""Verify prepared or committed locale-fix evidence against its pinned parent."""
import hashlib
import json
import re
import subprocess
from pathlib import Path

evidence = Path(__file__).resolve().parent
repo = evidence.parents[3]
manifest = json.loads((evidence / "static-inspection.json").read_text())
sums = (evidence / "SHA256SUMS.txt").read_text().splitlines()
base = manifest["pull_request"]["head"]
base_tree = manifest["pull_request"]["tree"]
source_paths = sorted(manifest["pre_patch_source_files"])
expected_files = sorted(manifest["expected_commit_files"])

def run(*args):
    return subprocess.check_output(args, cwd=repo, text=True).strip()

head = run("git", "rev-parse", "HEAD")
tree = run("git", "rev-parse", "HEAD^{tree}")
assert run("git", "rev-parse", f"{base}^{{tree}}") == base_tree

if head == base:
    state = "prepared"
    patch = subprocess.check_output(
        ["git", "diff", "--unified=0", base, "--", *source_paths], cwd=repo
    )
    status = subprocess.check_output(
        ["git", "status", "--porcelain", "--untracked-files=all"], cwd=repo, text=True
    ).splitlines()
    status_paths = sorted(line[3:] for line in status)
    assert status_paths == expected_files, (status_paths, expected_files)
elif run("git", "rev-parse", "HEAD^") == base:
    state = "committed"
    patch = subprocess.check_output(
        ["git", "diff", "--unified=0", base, "HEAD", "--", *source_paths], cwd=repo
    )
    commit_paths = sorted(run(
        "git", "diff-tree", "--no-commit-id", "--name-only", "-r", "HEAD"
    ).splitlines())
    assert commit_paths == expected_files, (commit_paths, expected_files)
    assert not run("git", "status", "--porcelain", "--untracked-files=all")
else:
    raise AssertionError(f"unsupported HEAD state: {head}")

for path, expected in manifest["pre_patch_blob_hashes"].items():
    actual = run("git", "rev-parse", f"{base}:{path}")
    assert actual == expected, (path, actual, expected)

for path, expected in manifest["prepared_blob_hashes"].items():
    actual = run("git", "hash-object", path)
    assert actual == expected, (path, actual, expected)

assert patch == (evidence / "patch.diff").read_bytes()
check_args = ["git", "diff", "--check", base]
if state == "committed":
    check_args.append("HEAD")
check_args.extend(["--", *source_paths])
subprocess.check_call(check_args, cwd=repo)

app_source = (repo / "src/pages/_app.tsx").read_text()
gate = app_source.rsplit("if (!localeReady) {", 1)[1].split(
    "\n  if (\n    isPathPrefix", 1
)[0]
for token in (
    'role="status"',
    'aria-live="polite"',
    'aria-atomic="true"',
    'aria-busy="true"',
    '<progress className="sr-only" aria-label="⏳" />',
    '<div aria-hidden="true">',
    "<LoadingSpinner />",
):
    assert token in gate, token
assert "return null" not in gate
assert "currentLocale" not in gate
assert "activeLocale" not in gate
assert "value=" not in gate  # Native progress is indeterminate.
assert not re.search(r">\s*[A-Za-z][^<]*<", gate)  # No untranslated text node.
assert 'useState(false);' in app_source[
    app_source.index("const [localeReady"):app_source.index("const [formatRegion")
]
success = app_source.split(".then((localeMessages) => {", 1)[1].split(
    "})\n      .catch", 1
)[0]
assert success.index("setMessages(localeMessages)") < success.index(
    "document.documentElement.lang = currentLocale"
)
assert success.index("document.documentElement.lang = currentLocale") < success.index(
    "setLocaleReady(true)"
)
assert success.index("document.documentElement.dir = getLocaleDirection(currentLocale)") < success.index(
    "setLocaleReady(true)"
)

checked = []
for line in sums:
    if not line.strip():
        continue
    digest, filename = line.split("  ", 1)
    path = evidence / filename
    actual = hashlib.sha256(path.read_bytes()).hexdigest()
    assert actual == digest, (filename, actual, digest)
    checked.append(filename)
assert checked, "checksum list is empty"
assert not any(path.startswith(".github/workflows/") for path in expected_files)

print(json.dumps({
    "result": "pass",
    "state": state,
    "head": head,
    "tree": tree,
    "changed_source_paths": source_paths,
    "checked_commit_paths": expected_files,
    "checked_evidence_files": checked
}, indent=2))
