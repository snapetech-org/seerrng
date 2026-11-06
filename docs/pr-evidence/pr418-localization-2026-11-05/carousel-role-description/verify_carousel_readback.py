#!/usr/bin/env python3
"""Verify the committed carousel role-description localization readback."""

from __future__ import annotations

import argparse
import hashlib
import json
import pathlib
import subprocess
import sys


EXPECTED_LOCALES = [
    "ar",
    "de",
    "es",
    "fr",
    "hi",
    "id",
    "ja",
    "ko",
    "pt-BR",
    "vi",
    "zh-CN",
    "zh-TW",
]
MESSAGE_ID = "components.BookSeriesSearch.CoverCarousel.roleDescription"


def git(repo: pathlib.Path, *args: str) -> bytes:
    result = subprocess.run(
        ["git", "-C", str(repo), *args],
        check=True,
        capture_output=True,
    )
    return result.stdout


def digest(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def json_bytes(data: bytes):
    return json.loads(data)


def verify_file_pin(repo: pathlib.Path, product: str, pin: dict) -> bytes:
    data = git(repo, "show", f"{product}:{pin['path']}")
    assert digest(data) == pin["sha256"], f"SHA-256 mismatch for {pin['path']}"
    blob = git(repo, "rev-parse", f"{product}:{pin['path']}").decode().strip()
    assert blob == pin["blobOid"], f"Git blob mismatch for {pin['path']}"
    return data


def verify(repo: pathlib.Path, packet: pathlib.Path) -> None:
    readback = json.loads((packet / "readback.json").read_text(encoding="utf-8"))
    product = readback["productHead"]
    parent = readback["parentHead"]
    tree = git(repo, "rev-parse", f"{product}^{{tree}}").decode().strip()
    assert tree == readback["productTree"], "product tree pin mismatch"
    assert readback["directLocales"] == EXPECTED_LOCALES
    assert readback["cellCount"] == 12
    assert readback["correctedCount"] == 7
    assert readback["retainedCount"] == 5

    source_id = readback["source"]["id"]
    source_text = readback["source"]["text"]
    source_hash = digest(source_text.encode("utf-8"))
    assert source_id == MESSAGE_ID
    assert source_text == "carousel"
    assert readback["source"]["sha256"] == source_hash

    english_blob = verify_file_pin(repo, product, readback["source"]["catalog"])
    english = json_bytes(english_blob)
    assert english[source_id] == source_text

    snapshot = json_bytes(
        verify_file_pin(repo, product, readback["source"]["snapshot"])
    )
    assert snapshot["client"][source_id] == source_hash

    caller = readback["caller"]
    caller_bytes = git(repo, "show", f"{product}:{caller['path']}")
    caller_text = caller_bytes.decode("utf-8")
    assert digest(caller_bytes) == caller["sha256"]
    assert caller["ariaExpressionPresent"]
    assert caller["ariaAttributeExpression"] in caller_text
    assert "roleDescription: 'carousel'" in caller_text

    provenance = json_bytes(
        verify_file_pin(repo, product, readback["provenance"]["file"])
    )
    provenance_rows = [
        row for row in provenance["entries"] if row.get("id") == source_id
    ]
    assert len(provenance_rows) == 12

    expected_changed_catalogs = []
    for cell in readback["cells"]:
        locale = cell["locale"]
        path = cell["catalogPath"]
        before_blob = git(repo, "show", f"{parent}:{path}")
        after_blob = git(repo, "show", f"{product}:{path}")
        before = json_bytes(before_blob)
        after = json_bytes(after_blob)
        assert before[source_id] == cell["before"]
        assert after[source_id] == cell["after"]
        assert digest(cell["before"].encode("utf-8")) == cell["beforeSha256"]
        assert digest(cell["after"].encode("utf-8")) == cell["afterSha256"]
        assert digest(after_blob) == cell["catalogSha256"]
        assert git(repo, "rev-parse", f"{product}:{path}").decode().strip() == cell[
            "catalogBlobOid"
        ]
        assert list(after).index(source_id) == cell["keyIndexZeroBased"]
        assert cell["after"].strip() and cell["after"] != source_text
        assert not any(
            cell[field]
            for field in (
                "placeholderMismatch",
                "markupMismatch",
                "numberMismatch",
                "protectedLiteralMismatch",
            )
        )
        if cell["before"] == cell["after"]:
            assert cell["disposition"] == "retain-current"
        else:
            assert cell["disposition"] == "correct"
            expected_changed_catalogs.append(path)
        entry = next(row for row in provenance_rows if row["locale"] == locale)
        assert entry["status"] == "draft"
        assert entry["provenance"] == "machine-draft"
        assert entry["sourceHash"] == source_hash
        assert entry["targetHash"] == cell["afterSha256"]

        # Confirm the pushed checkout has the same catalog content as the pinned commit.
        worktree_blob = (repo / path).read_bytes()
        assert digest(worktree_blob) == cell["catalogSha256"]

    manifest = json_bytes(
        verify_file_pin(repo, product, readback["sourceDelta"]["file"])
    )
    assert manifest["localeAccounting"]["pendingDirectCellCount"] == 0
    assert manifest["localeAccounting"]["pendingDirectLocales"] == []
    assert manifest["translationCatalogsChanged"] == expected_changed_catalogs
    assert expected_changed_catalogs == [
        "src/i18n/locale/ar.json",
        "src/i18n/locale/id.json",
        "src/i18n/locale/ko.json",
        "src/i18n/locale/pt_BR.json",
        "src/i18n/locale/vi.json",
        "src/i18n/locale/zh_Hans.json",
        "src/i18n/locale/zh_Hant.json",
    ]

    fallback = json_bytes(
        verify_file_pin(repo, product, readback["fallback"]["file"])
    )
    assert not any(
        entry.get("domain") == "client" and entry.get("id") == source_id
        for entry in fallback["entries"]
    )
    assert readback["fallback"]["runtimeFallbackChanged"] is False

    for item in readback["preservedRuntimeFiles"]:
        assert item["parentBlobOid"] == item["productBlobOid"]
        actual = git(repo, "rev-parse", f"{product}:{item['path']}").decode().strip()
        assert actual == item["productBlobOid"]

    changed_files = git(repo, "diff", "--name-only", f"{parent}..{product}")
    actual_changed = changed_files.decode().splitlines()
    assert actual_changed == readback["changedProductFiles"]
    print(
        "PASS: pinned product readback verified — "
        f"{readback['cellCount']} cells, {readback['correctedCount']} corrections, "
        f"{readback['retainedCount']} retained; no pending direct cells."
    )


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=pathlib.Path)
    args = parser.parse_args()
    packet = pathlib.Path(__file__).resolve().parent
    repo = args.repo.resolve() if args.repo else packet.parents[3]
    try:
        verify(repo, packet)
    except Exception as error:  # noqa: BLE001 - verifier reports a concise failure
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
