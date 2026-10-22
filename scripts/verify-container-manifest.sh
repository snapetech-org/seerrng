#!/usr/bin/env bash
set -euo pipefail

manifest_requirement='none'
case "${1:-}" in
  --require-provenance)
    manifest_requirement='provenance'
    shift
    ;;
  --require-docker-list)
    manifest_requirement='docker-list'
    shift
    ;;
  --require-compatible-manifest)
    manifest_requirement='compatible'
    shift
    ;;
esac
image_ref="${1:?usage: verify-container-manifest.sh [--require-provenance|--require-docker-list|--require-compatible-manifest] <image-ref> [platform ...]}"
shift

if (($# == 0)); then
  set -- linux/amd64 linux/arm64
fi

command -v docker >/dev/null 2>&1 || {
  echo 'docker is required to verify a container manifest.' >&2
  exit 1
}
command -v jq >/dev/null 2>&1 || {
  echo 'jq is required to verify a container manifest.' >&2
  exit 1
}

raw_manifest=''
max_attempts=5
for ((attempt = 1; attempt <= max_attempts; attempt++)); do
  if raw_manifest="$(docker buildx imagetools inspect --raw "$image_ref")"; then
    break
  fi
  if ((attempt == max_attempts)); then
    echo "Unable to inspect ${image_ref} after ${max_attempts} attempts." >&2
    exit 1
  fi
  delay_seconds=$((2 ** (attempt - 1)))
  echo "Manifest inspection failed for ${image_ref}; retrying in ${delay_seconds}s." >&2
  sleep "$delay_seconds"
done
jq -e '.manifests | type == "array"' >/dev/null <<<"$raw_manifest" || {
  echo "${image_ref} is not a multi-platform manifest list or index." >&2
  exit 1
}

manifest_media_type="$(jq -r '.mediaType // ""' <<<"$raw_manifest")"

actual_platforms="$(jq -r '
  [.manifests[]
    | select(.platform.os? and .platform.architecture?)
    | select(.platform.os != "unknown" and .platform.architecture != "unknown")
    | (.platform.os + "/" + .platform.architecture
      + (if .platform.variant? then "/" + .platform.variant else "" end))]
  | unique
  | .[]
' <<<"$raw_manifest" | sort -u)"
expected_platforms="$(printf '%s\n' "$@" | sort -u)"

if ! diff -u <(printf '%s\n' "$expected_platforms") <(printf '%s\n' "$actual_platforms"); then
  echo "${image_ref} has an unexpected platform set." >&2
  exit 1
fi

verify_docker_manifest_list() {
  [[ "$manifest_media_type" == 'application/vnd.docker.distribution.manifest.list.v2+json' ]] || {
    echo "${image_ref} is not a Docker v2 manifest list (got ${manifest_media_type:-no media type})." >&2
    return 1
  }

  local descriptor_count runnable_count
  descriptor_count="$(jq '.manifests | length' <<<"$raw_manifest")"
  runnable_count="$(jq '[.manifests[]
    | select(.platform.os? and .platform.architecture?)
    | select(.platform.os != "unknown" and .platform.architecture != "unknown")
  ] | length' <<<"$raw_manifest")"
  [[ "$descriptor_count" == "$runnable_count" ]] || {
    echo "${image_ref} has non-platform descriptors in its Docker v2 manifest list." >&2
    return 1
  }

  jq -e '[.manifests[] | .mediaType] | length > 0 and all(.[]; . == "application/vnd.docker.distribution.manifest.v2+json")' \
    >/dev/null <<<"$raw_manifest" || {
      echo "${image_ref} contains a non-Docker child manifest." >&2
      return 1
    }
}

verify_provenance() {
  local provenance_count
  provenance_count="$(jq '[.manifests[]? | select(.annotations["vnd.docker.reference.type"] == "attestation-manifest")] | length' <<<"$raw_manifest")"
  [[ "$provenance_count" -gt 0 ]] || {
    echo "${image_ref} has no BuildKit provenance attestation." >&2
    return 1
  }
}

case "$manifest_requirement" in
  docker-list)
    verify_docker_manifest_list || exit 1
    ;;
  provenance)
    verify_provenance || exit 1
    ;;
  compatible)
    case "$manifest_media_type" in
      application/vnd.docker.distribution.manifest.list.v2+json)
        verify_docker_manifest_list || exit 1
        ;;
      application/vnd.oci.image.index.v1+json)
        verify_provenance || exit 1
        ;;
      *)
        echo "${image_ref} has an unsupported multi-platform media type: ${manifest_media_type:-no media type}." >&2
        exit 1
        ;;
    esac
    ;;
esac

echo "Verified ${image_ref}: ${actual_platforms//$'\n'/, }"
