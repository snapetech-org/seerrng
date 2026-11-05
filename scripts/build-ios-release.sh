#!/usr/bin/env bash
set -euo pipefail

tag="${1:?Usage: build-ios-release.sh vX.Y.Z [output-directory]}"
output_dir="${2:-dist-release}"
if [[ ! "$tag" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "iOS release tag must be a semantic version: $tag" >&2
  exit 2
fi

short_version="${tag#v}"
short_version="${short_version%%-*}"
build_number="${IOS_BUILD_NUMBER:-${GITHUB_RUN_NUMBER:-1}}"
if [[ ! "$build_number" =~ ^[1-9][0-9]*$ ]]; then
  echo "IOS_BUILD_NUMBER must be a positive integer: $build_number" >&2
  exit 2
fi

if ! command -v xcodebuild >/dev/null 2>&1; then
  echo 'Xcode and xcodebuild are required. Run this script on a macOS host.' >&2
  exit 2
fi
xcode_version="$(xcodebuild -version | awk '/^Xcode / { version = $2 } END { print version }')"
xcode_major="${xcode_version%%.*}"
if [[ ! "$xcode_major" =~ ^[0-9]+$ ]] || (( xcode_major < 26 )); then
  echo "Xcode 26 or newer is required for current App Store upload requirements; found ${xcode_version:-unknown}." >&2
  exit 2
fi

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=ios-release-workspace.sh
source "$script_dir/ios-release-workspace.sh"
build_dir="$(ios_release_create_local_workspace build)"
mkdir -m 700 "$build_dir/tmp"
export TMPDIR="$build_dir/tmp"
mkdir -p "$output_dir"
result_bundle="$build_dir/seerrng-${tag}-ios-tests.xcresult"

cleanup() {
  local exit_status=$?
  local preserve_workspace=false
  trap - EXIT

  if (( exit_status != 0 )) && [[ -d "$result_bundle" ]]; then
    local diagnostic_archive="$build_dir/seerrng-${tag}-ios-tests.xcresult.zip"
    if ditto -c -k --sequesterRsrc --keepParent "$result_bundle" "$diagnostic_archive" \
      && cp -- "$diagnostic_archive" "$output_dir/"; then
      echo "Preserved Xcode test diagnostics at $output_dir/${diagnostic_archive##*/}" >&2
    else
      echo "Could not copy Xcode diagnostics; retained local workspace at $build_dir" >&2
      preserve_workspace=true
    fi
  fi

  if [[ "$preserve_workspace" != true ]]; then
    rm -rf -- "$build_dir"
  fi
  exit "$exit_status"
}
trap cleanup EXIT

project='ios/SeerrNG.xcodeproj'
scheme='SeerrNG'
version_settings=("MARKETING_VERSION=$short_version" "CURRENT_PROJECT_VERSION=$build_number")
xcodebuild -list -project "$project" -scheme "$scheme"

xcodebuild \
  -project "$project" \
  -scheme "$scheme" \
  -configuration Debug \
  -destination "platform=iOS Simulator,name=${IOS_SIMULATOR_NAME:-iPhone 17}" \
  -derivedDataPath "$build_dir/DerivedData" \
  -resultBundlePath "$result_bundle" \
  "${version_settings[@]}" \
  CODE_SIGNING_ALLOWED=NO \
  test

xcodebuild \
  -project "$project" \
  -scheme "$scheme" \
  -configuration Release \
  -destination 'generic/platform=iOS Simulator' \
  -derivedDataPath "$build_dir/DerivedData" \
  "${version_settings[@]}" \
  CODE_SIGNING_ALLOWED=NO \
  build

app="$build_dir/DerivedData/Build/Products/Release-iphonesimulator/SeerrNG.app"
test -d "$app"
plutil -lint -- "$app/Info.plist"
archive_name="seerrng-${tag}-ios-simulator.zip"
local_archive="$build_dir/$archive_name"
ditto -c -k --sequesterRsrc --keepParent "$app" "$local_archive"
local_checksum="$build_dir/${archive_name%.zip}.sha256"
(cd "$build_dir" && shasum -a 256 "$archive_name" > "${archive_name%.zip}.sha256")
cp -- "$local_archive" "$output_dir/$archive_name"
cp -- "$local_checksum" "$output_dir/"
archive="$output_dir/$archive_name"
echo "Built iOS Simulator app package: $archive"
echo 'This .app package runs in the iOS Simulator; it is not an iPhone/iPad installable IPA.'
