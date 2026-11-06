#!/usr/bin/env python3
"""Verify the SeerrNG W3840-W3859 cross-review packet and applied catalog readback."""
from __future__ import annotations
import hashlib, json, re, subprocess, sys
from pathlib import Path
EVIDENCE = Path(__file__).resolve().parent
ROOT = next((p for p in EVIDENCE.parents if (p / ".git").exists()), None)
BASE = "ba5bb93cdb4f107a8337aae228b7cd397e1140a6"
BASE_TREE = "5420ae8fa33bda3619650757a2930a0114dbe4d1"
APP = "a18ba1d0d24dcc07d7b944669e57ff211dcb85a5"
APP_TREE = "c1f19c1e7189a08da422c70339243870ff9be82e"
LOCALE_PATHS = {
    "ar":"src/i18n/locale/ar.json", "de":"src/i18n/locale/de.json",
    "es":"src/i18n/locale/es.json", "fr":"src/i18n/locale/fr.json",
    "hi":"src/i18n/locale/hi.json", "id":"src/i18n/locale/id.json",
    "ja":"src/i18n/locale/ja.json", "ko":"src/i18n/locale/ko.json",
    "pt-BR":"src/i18n/locale/pt_BR.json", "vi":"src/i18n/locale/vi.json",
    "zh-Hans":"src/i18n/locale/zh_Hans.json", "zh-Hant":"src/i18n/locale/zh_Hant.json",
}
SUPPLEMENT = {"README.md","POST-APPLICATION.md","application-readback.jsonl","application-summary.json","catalog-preimages.json","post-application-manifest.json","verify-post-application.py"}
def sha(data: bytes) -> str: return hashlib.sha256(data).hexdigest()
def git(*args: str) -> bytes: return subprocess.check_output(["git","-C",str(ROOT),*args])
def jsonl(path: Path): return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]
def parse_checksums(path: Path):
    entries={}
    for line in path.read_text(encoding="utf-8").splitlines():
        if not line: continue
        digest,name=line.split("  ",1)
        rel=Path(name)
        if rel.is_absolute() or ".." in rel.parts or name in entries: raise ValueError("unsafe/duplicate checksum path: "+name)
        entries[name]=digest
    return entries
def verify_checksum_list(base: Path, filename: str, expected=None):
    entries=parse_checksums(base/filename)
    for name,digest in entries.items():
        target=base/name
        if not target.is_file() or sha(target.read_bytes())!=digest: raise ValueError("checksum mismatch: "+str(target))
    if expected is not None and set(entries)!=expected: raise ValueError("checksum inventory mismatch: "+filename)
    return entries
def token_values(text: str, source_tokens: dict):
    vals={
      "placeholders":re.findall(r"\{[^{}]+\}",text),
      "markupTags":re.findall(r"<[^>]+>",text),
      "numericTokens":re.findall(r"(?<![A-Za-z])\d+(?:[.,]\d+)*(?![A-Za-z])",text),
      "protectedLiterals":[t for t in source_tokens["protectedLiterals"] if re.search(r"(?<![A-Za-z0-9])"+re.escape(t)+r"(?![A-Za-z0-9])",text)],
    }
    return vals
def fail(msg): raise ValueError(msg)
def main():
    if ROOT is None: fail("repository root not found")
    # Nested cross verifier re-runs the candidate-free, primary, portable-packet, and blind verifiers.
    cross_dir=EVIDENCE/"cross-audit"
    cross_result=json.loads(subprocess.check_output([sys.executable,str(cross_dir/"verify_cross_audit.py")],text=True))
    if cross_result.get("result")!="PASS" or cross_result.get("head")!=BASE or cross_result.get("tree")!=BASE_TREE: fail("cross-audit verifier/pin failed")
    # The supplement list covers our application records; outer list covers the complete bundle,
    # including all four review packets preserved within cross-audit/.
    verify_checksum_list(EVIDENCE,"POST-APPLICATION-SHA256SUMS.txt",SUPPLEMENT)
    outer=parse_checksums(EVIDENCE/"SHA256SUMS.txt")
    actual={p.relative_to(EVIDENCE).as_posix() for p in EVIDENCE.rglob("*") if p.is_file() and p.name!="SHA256SUMS.txt"}
    if set(outer)!=actual: fail("outer evidence inventory mismatch")
    for name,digest in outer.items():
        if sha((EVIDENCE/name).read_bytes())!=digest: fail("outer checksum mismatch: "+name)
    manifest=json.loads((EVIDENCE/"post-application-manifest.json").read_text(encoding="utf-8"))
    if manifest["pinnedPrHead"]!=BASE or manifest["pinnedPrTree"]!=BASE_TREE or manifest["applicationCommit"]!=APP or manifest["applicationCommitTree"]!=APP_TREE: fail("post-application pin mismatch")
    if git("rev-parse",f"{BASE}^{{tree}}").decode().strip()!=BASE_TREE or git("rev-parse",f"{APP}^{{tree}}").decode().strip()!=APP_TREE: fail("Git tree pin mismatch")
    if git("rev-parse",f"{APP}^").decode().strip()!=BASE: fail("catalog commit parent mismatch")
    head=git("rev-parse","HEAD").decode().strip()
    if head not in (APP,) and git("rev-parse","HEAD^").decode().strip()!=APP: fail("HEAD does not contain the catalog commit followed only by evidence commit")
    cross_manifest=(cross_dir/"manifest.json").read_bytes()
    if sha(cross_manifest)!=manifest["crossPacketManifestSha256"]: fail("cross packet manifest hash mismatch")
    if sha((cross_dir/"SHA256SUMS.txt").read_bytes())!=manifest["crossPacketChecksumListSha256"]: fail("cross packet checksum-list hash mismatch")
    cross_rows=jsonl(cross_dir/"cross-ledger.jsonl")
    readback=jsonl(EVIDENCE/"application-readback.jsonl")
    source_rows=jsonl(cross_dir/"inputs/portable-packet/candidate-free-input/selected-source-cells.jsonl")
    if len(cross_rows)!=240 or len(readback)!=240 or len(source_rows)!=20: fail("240-cell evidence count mismatch")
    xb={(r["position"],r["locale"]):r for r in cross_rows}
    rb={(r["position"],r["locale"]):r for r in readback}
    src={r["position"]:r for r in source_rows}
    if len(xb)!=240 or len(rb)!=240: fail("duplicate/missing source-locale cells")
    expected_changes={}
    disposition_counts={"accept-current":0,"correction":0,"refinement":0,"hold":0}
    for key,x in xb.items():
        pos,locale=key
        if x["head"]!=BASE or x["tree"]!=BASE_TREE: fail("cross row not pinned to reviewed head")
        if locale not in LOCALE_PATHS: fail("unexpected locale: "+locale)
        source=src[pos]["sourceTokens"]
        target=x["selectedTarget"] if x["crossDisposition"] in ("correction","refinement") else x["currentTarget"]
        if x["crossDisposition"] not in disposition_counts: fail("unknown disposition")
        disposition_counts[x["crossDisposition"]]+=1
        if x["crossDisposition"]=="hold": fail("unexpected hold in applied window")
        if not isinstance(target,str) or not target: fail("empty target")
        if token_values(target,source)!={
            "placeholders":source["placeholders"],"markupTags":source["markupTags"],
            "numericTokens":source["numericTokens"],"protectedLiterals":source["protectedLiterals"]}:
            fail(f"token/protected-literal mismatch at {key}")
        record=rb[key]
        path=LOCALE_PATHS[locale]
        if record["catalogPath"]!=path or record["sourceId"]!=x["sourceId"] or record["crossDisposition"]!=x["crossDisposition"]: fail("readback identity mismatch at "+str(key))
        if record["postimageValue"]!=target or record["postimageSha256"]!=sha(target.encode("utf-8")) or not record["postimageMatchesCrossTarget"]: fail("cell readback mismatch at "+str(key))
        if record["preimageSha256"]!=x["currentTargetSha256"]: fail("cell preimage hash mismatch at "+str(key))
        if x["crossDisposition"] in ("correction","refinement"):
            expected_changes[(path,x["sourceId"])]=target
    if disposition_counts!={"accept-current":194,"correction":24,"refinement":22,"hold":0}: fail("cross disposition count mismatch: "+repr(disposition_counts))
    if len(expected_changes)!=46: fail("selected correction/refinement count mismatch")
    # Compare committed JSON with pinned baseline, including exact key order and only selected cell changes.
    actual_changes={}
    for locale,path in list(LOCALE_PATHS.items())+[("en","src/i18n/locale/en.json")]:
        before=json.loads(git("show",f"{BASE}:{path}").decode("utf-8"))
        after=json.loads(git("show",f"{APP}:{path}").decode("utf-8"))
        if list(before)!=list(after) or set(before)!=set(after): fail("catalog key set/order changed: "+path)
        for key in before:
            if before[key]!=after[key]: actual_changes[(path,key)]=after[key]
    if actual_changes!=expected_changes: fail("catalog contains missing or non-selected changes")
    if len({path for path,_ in expected_changes})!=12: fail("expected exactly 12 changed locale catalogs")
    changed_paths=git("diff","--name-only",f"{BASE}..{APP}").decode().splitlines()
    expected_paths=sorted(set(LOCALE_PATHS.values())|{"CHANGELOG.md"})
    if sorted(changed_paths)!=expected_paths: fail("catalog commit path scope mismatch: "+repr(sorted(changed_paths)))
    if git("diff","--name-only",f"{BASE}..{APP}","--",".github/workflows").decode().strip(): fail("workflow path changed")
    # The recorded preimages/postimages must match committed bytes and Git blob ids.
    pre={r["path"]:r for r in manifest["catalogPreimages"]}
    post={r["path"]:r for r in manifest["catalogPostimages"]}
    if set(pre)!=set(LOCALE_PATHS.values()) or set(post)!=set(LOCALE_PATHS.values()): fail("catalog hash inventory mismatch")
    for path in LOCALE_PATHS.values():
        before=git("show",f"{BASE}:{path}"); after=git("show",f"{APP}:{path}")
        if sha(before)!=pre[path]["sha256"] or git("rev-parse",f"{BASE}:{path}").decode().strip()!=pre[path]["gitBlob"]: fail("catalog preimage pin mismatch: "+path)
        if sha(after)!=post[path]["postSha256"] or git("rev-parse",f"{APP}:{path}").decode().strip()!=post[path]["postGitBlob"]: fail("catalog postimage pin mismatch: "+path)
    changelog_before=git("show",f"{BASE}:CHANGELOG.md")
    changelog_after=git("show",f"{APP}:CHANGELOG.md")
    bullet=manifest["changelogEntry"].encode()
    if sha(changelog_before)!=manifest["changelogSha256Before"] or sha(changelog_after)!=manifest["changelogSha256After"]: fail("changelog hash mismatch")
    if changelog_after.count(bullet)!=1: fail("expected one changelog entry")
    summary=json.loads((EVIDENCE/"application-summary.json").read_text(encoding="utf-8"))
    if summary["readbackMatches"]!=240 or summary["appliedUpdates"]!=46 or summary["acceptedUnchanged"]!=194 or summary["holds"]!=0 or summary["placeholdersMarkupNumericMismatches"]!=0 or summary["protectedLiteralMismatches"]!=0: fail("application summary count mismatch")
    if manifest["readbackRows"]!=240 or manifest["readbackMismatches"]!=0 or manifest["selectedUpdatesVsPinnedPrHead"]!=46 or manifest["workflowFilesChanged"]!=[]: fail("manifest count/scope mismatch")
    print(json.dumps({"result":"PASS","catalogCommit":APP,"tree":APP_TREE,"readbackCells":len(rb),"corrections":disposition_counts["correction"],"refinements":disposition_counts["refinement"],"acceptedUnchanged":disposition_counts["accept-current"],"holds":disposition_counts["hold"],"changedLocales":12,"selectedUpdates":len(expected_changes),"tokenMismatches":0,"workflowPathsChanged":0,"crossVerifier":"PASS","evidenceFilesVerified":len(outer)+1},ensure_ascii=False,sort_keys=True))
if __name__=="__main__":
    try: main()
    except Exception as exc:
        print("FAIL:",exc,file=sys.stderr); raise SystemExit(1)
