#!/usr/bin/env bash
# Shared local-workspace guard for Xcode release scripts. Source this file from
# the release-tooling checkout, never from the release-tag checkout.

ios_release_create_local_workspace() {
  local purpose="${1:?a workspace purpose is required}"
  local temp_root="${SEERRNG_IOS_LOCAL_TEMP_ROOT:-/private/tmp}"
  local filesystem_type
  local available_kib
  local filesystem_status

  if [[ ! "$purpose" =~ ^[a-z][a-z0-9-]{0,23}$ ]]; then
    echo "Invalid local Xcode workspace purpose: $purpose" >&2
    return 2
  fi
  if [[ ! -d "$temp_root" || -L "$temp_root" || ! -w "$temp_root" ]]; then
    echo "Local Xcode temp root is missing, linked, or not writable: $temp_root" >&2
    return 1
  fi

  # Darwin stat -f %T reports a file type, not the filesystem type. Darwin
  # df -Y includes the filesystem type; -Pk keeps sizes in integer KiB.
  filesystem_status="$(LC_ALL=C df -PkY "$temp_root")" || {
    echo "Could not identify the filesystem for local Xcode temp root: $temp_root" >&2
    return 1
  }
  filesystem_type="$(awk 'NR == 2 { print $2 }' <<<"$filesystem_status")"
  if [[ "$filesystem_type" != 'apfs' ]]; then
    echo "Xcode release builds require local APFS storage; $temp_root is on $filesystem_type." >&2
    return 1
  fi

  available_kib="$(awk 'NR == 2 { print $5 }' <<<"$filesystem_status")"
  if [[ ! "$available_kib" =~ ^[0-9]+$ ]] || (( available_kib < 15 * 1024 * 1024 )); then
    echo "Local APFS temp root must have at least 15 GiB free for Xcode; available KiB: ${available_kib:-unknown}." >&2
    return 1
  fi

  mktemp -d "${temp_root%/}/seerrng-ios-$purpose.XXXXXX"
}
