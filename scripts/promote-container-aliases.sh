#!/usr/bin/env bash
set -euo pipefail

version="${1:?usage: promote-container-aliases.sh <stable-version> <ghcr-image> <docker-hub-image>}"
ghcr_image="${2:?usage: promote-container-aliases.sh <stable-version> <ghcr-image> <docker-hub-image>}"
docker_hub_image="${3:?usage: promote-container-aliases.sh <stable-version> <ghcr-image> <docker-hub-image>}"

if [[ ! "$version" =~ ^v([0-9]+)\.([0-9]+)\.([0-9]+)$ ]]; then
  echo "Expected a stable semantic version such as v3.71.1; received: $version" >&2
  exit 2
fi

major_tag="v${BASH_REMATCH[1]}"
minor_tag="v${BASH_REMATCH[1]}.${BASH_REMATCH[2]}"
aliases=("$minor_tag" "$major_tag" stable latest main master)

for image in "$ghcr_image" "$docker_hub_image"; do
  tag_args=()
  for alias in "${aliases[@]}"; do
    tag_args+=(--tag "${image}:${alias}")
  done

  docker buildx imagetools create "${tag_args[@]}" "${image}:${version}"
done

bash scripts/verify-container-aliases.sh "$version" "$ghcr_image" "$docker_hub_image"
