#!/usr/bin/env bash
set -euo pipefail

repository="${GITHUB_REPOSITORY:-}"
if [[ ! "$repository" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
  echo 'GITHUB_REPOSITORY must identify the repository whose releases are being prepared.' >&2
  exit 2
fi

if ! published_tags="$(
  gh api --paginate -X GET -f per_page=100 "repos/${repository}/releases" \
    --jq '.[] | select(.draft == false and .prerelease == false) | .tag_name'
  )"; then
  echo "Unable to query published releases for ${repository}." >&2
  exit 1
fi

# Draft releases can be published out of order after a recovery run. Choose the
# highest stable version, not the release that happened to publish most recently.
# The JavaScript runs as a single-quoted constant; no shell interpolation is intended.
# shellcheck disable=SC2016
latest_published_tag="$(
  printf '%s\n' "$published_tags" |
    node --input-type=commonjs -e '
      const tags = require("node:fs")
        .readFileSync(0, "utf8")
        .split(/\r?\n/u)
        .filter((tag) => /^v(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.test(tag));
      const parts = (tag) => tag.slice(1).split(".").map(BigInt);
      tags.sort((left, right) => {
        const leftParts = parts(left);
        const rightParts = parts(right);
        for (let index = 0; index < leftParts.length; index += 1) {
          if (leftParts[index] !== rightParts[index]) {
            return leftParts[index] > rightParts[index] ? 1 : -1;
          }
        }
        return 0;
      });
      process.stdout.write(`${tags.at(-1) ?? ""}\n`);
    '
)"

if [[ ! "$latest_published_tag" =~ ^v[0-9][0-9A-Za-z._+-]{0,126}$ ]]; then
  echo "Unable to determine the latest published release tag for ${repository}." >&2
  exit 1
fi

if ! git rev-parse --verify --quiet "${latest_published_tag}^{commit}" >/dev/null; then
  echo "Latest published release tag ${latest_published_tag} is missing from the local checkout." >&2
  exit 1
fi

printf '%s\n' "$latest_published_tag"
