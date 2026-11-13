#!/usr/bin/env bash
set -euo pipefail

if ! git rev-parse --git-dir >/dev/null 2>&1; then
  exit 0
fi

if git diff --cached --quiet --exit-code; then
  exit 0
fi

problem=0
tmp="$(mktemp)"
trap 'rm -f "$tmp"' EXIT

git diff --cached --name-status --diff-filter=ACMR > "$tmp"

is_fresh_file() {
  local status="$1"
  [[ "$status" == A* || "$status" == C* ]]
}

is_exempt_path() {
  local path="$1"

  case "$path" in
    scripts/check-attribution.sh)
      return 0
      ;;
    NOTICE.md|LICENSE|CONTRIBUTING.md|CODE_OF_CONDUCT.md|SECURITY.md)
      return 0
      ;;
    docs/migration-guide.mdx|docs/using-seerr/advanced/verifying-signed-artifacts.mdx)
      return 0
      ;;
    server/migration/postgres/1789254652580-RemapOverseerrDeletedStatus.ts|server/migration/sqlite/1789254652493-RemapOverseerrDeletedStatus.ts)
      # These import-compatibility migrations retain their upstream names and issue links; see NOTICE.md.
      return 0
      ;;
    gen-docs/blog/*|src/i18n/locale/*)
      return 0
      ;;
  esac

  return 1
}

is_repo_metadata_path() {
  local path="$1"

  case "$path" in
    README.md|package.json|.github/*|charts/*|packaging/*|gen-docs/docusaurus.config.ts|gen-docs/static/CNAME|docs/README.md|docs/maintainers/*)
      return 0
      ;;
  esac

  return 1
}

has_upstream_branding() {
  rg -n --no-heading \
    'github\.com/seerr-team/seerr|ghcr\.io/seerr-team/seerr|docs\.seerr\.dev|Seerr Team|seerr-team' \
    "$1" >/dev/null 2>&1
}

has_explicit_upstream_source_credit() {
  local path="$1"

  rg -qi 'Source: .*https://github\.com/seerr-team/seerr/' "$path" &&
    rg -q '\[[^]]+\]\(https://github\.com/[A-Za-z0-9-]+\)' "$path" &&
    rg -qi '(contributed|suggested|reported).{0,100}upstream|upstream.{0,100}(contributed|suggested|reported)' "$path" &&
    rg -q 'SeerrNG independently (adapted|integrated|verified)' "$path"
}

while IFS=$'\t' read -r status path rest; do
  [[ -n "${path:-}" ]] || continue
  [[ -f "$path" ]] || continue

  if is_exempt_path "$path"; then
    continue
  fi

  if is_fresh_file "$status" && has_upstream_branding "$path" && ! has_explicit_upstream_source_credit "$path"; then
    echo "Attribution check: fresh file contains upstream Seerr branding: $path" >&2
    problem=1
    continue
  fi

  if is_repo_metadata_path "$path"; then
    if git diff --cached --unified=0 -- "$path" \
      | rg -n '^\+.*(github\.com/seerr-team/seerr|ghcr\.io/seerr-team/seerr|docs\.seerr\.dev|Seerr Team|seerr-team)' >/dev/null; then
      echo "Attribution check: repo metadata adds upstream Seerr attribution/linking: $path" >&2
      problem=1
    fi
  fi
done < "$tmp"

if [[ "$problem" -ne 0 ]]; then
  cat >&2 <<'MSG'

Fresh SeerrNG files and repo metadata should be attributed to SeerrNG/snapetech.
Inherited or compatibility content can still mention upstream Seerr, but make
that explicit in NOTICE.md or in nearby text.

Bypass only for a deliberate exception:
  HUSKY_BYPASS=1 git commit ...
MSG
  exit 1
fi
