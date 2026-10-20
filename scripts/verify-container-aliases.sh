#!/usr/bin/env bash
set -euo pipefail

version="${1:?usage: verify-container-aliases.sh <stable-version> <ghcr-image> <docker-hub-image>}"
ghcr_image="${2:?usage: verify-container-aliases.sh <stable-version> <ghcr-image> <docker-hub-image>}"
docker_hub_image="${3:?usage: verify-container-aliases.sh <stable-version> <ghcr-image> <docker-hub-image>}"

if [[ ! "$version" =~ ^v([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
  echo "Expected a stable semantic version such as v3.71.1; received: $version" >&2
  exit 2
fi

major_tag="v${BASH_REMATCH[1]}"
minor_tag="v${BASH_REMATCH[1]}.${BASH_REMATCH[2]}"

get_digest() {
  local reference="$1"
  local raw digest

  for attempt in 1 2 3 4 5; do
    if raw="$(docker buildx imagetools inspect "$reference" --format '{{json .Manifest.Digest}}')"; then
      digest="${raw//\"/}"
      if [[ "$digest" =~ ^sha256:[0-9a-f]{64}$ ]]; then
        printf '%s\n' "$digest"
        return 0
      fi
    fi

    if (( attempt == 5 )); then
      echo "Unable to resolve a manifest digest for $reference." >&2
      return 1
    fi

    sleep $((attempt * 5))
  done
}

expected_digest="$(get_digest "${ghcr_image}:${version}")"
docker_hub_version_digest="$(get_digest "${docker_hub_image}:${version}")"

if [[ "$docker_hub_version_digest" != "$expected_digest" ]]; then
  echo "Release tag digest differs between GHCR and Docker Hub: ${expected_digest} != ${docker_hub_version_digest}" >&2
  exit 1
fi

for image in "$ghcr_image" "$docker_hub_image"; do
  for tag in "$version" "$minor_tag" "$major_tag" stable latest main master; do
    actual_digest="$(get_digest "${image}:${tag}")"
    if [[ "$actual_digest" != "$expected_digest" ]]; then
      echo "${image}:${tag} points to ${actual_digest}; expected ${expected_digest} from ${ghcr_image}:${version}." >&2
      exit 1
    fi
  done
done

printf 'Verified stable aliases and version tags across both registries at %s.\n' "$expected_digest"
