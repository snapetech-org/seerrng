#!/usr/bin/env bash
set -euo pipefail

script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd -P)"
# shellcheck source=ios-release-workspace.sh
source "$script_dir/ios-release-workspace.sh"

# Exercise the real Darwin tools before installing fixtures. A mocked GNU-style
# stat result previously hid a macOS filesystem detection bug.
if [[ "$(uname -s)" == Darwin ]]; then
  native_workspace="$(ios_release_create_local_workspace native-check)"
  [[ -d "$native_workspace" ]]
  rmdir -- "$native_workspace"
fi

test_root="$(mktemp -d)"
trap 'rm -rf -- "$test_root"' EXIT
fake_bin="$test_root/bin"
local_root="$test_root/local-apfs"
mkdir -p "$fake_bin" "$local_root"

cat > "$fake_bin/df" <<'DF'
#!/usr/bin/env bash
set -euo pipefail
[[ "$1" == '-PkY' ]]
printf 'Filesystem Type 1024-blocks Used Available Capacity Mounted on\n'
printf '/dev/test %s 100000000 1 %s 1%% %s\n' "${IOS_TEST_FILESYSTEM:-apfs}" "${IOS_TEST_AVAILABLE_KIB:-20000000}" "$2"
DF
chmod +x "$fake_bin/df"
cat > "$fake_bin/xcodebuild" <<'XCODEBUILD'
#!/usr/bin/env bash
set -euo pipefail

if [[ "$1" == '-version' ]]; then
  printf 'Xcode 26.0\nBuild version 17A000\n'
  exit 0
fi
if [[ "$1" == '-list' ]]; then
  printf 'Schemes:\n    SeerrNG\n'
  exit 0
fi

task="${!#}"
args=("$@")
derived_data=''
result_bundle=''
for ((index = 0; index < ${#args[@]}; index += 1)); do
  case "${args[index]}" in
    -derivedDataPath) derived_data="${args[index + 1]}" ;;
    -resultBundlePath) result_bundle="${args[index + 1]}" ;;
  esac
done
[[ "$derived_data" == "$SEERRNG_IOS_LOCAL_TEMP_ROOT"/seerrng-ios-build.*/DerivedData ]]
[[ "$TMPDIR" == "$SEERRNG_IOS_LOCAL_TEMP_ROOT"/seerrng-ios-build.*/tmp ]]

if [[ "$task" == 'test' ]]; then
  [[ "$result_bundle" == "$SEERRNG_IOS_LOCAL_TEMP_ROOT"/seerrng-ios-build.*/seerrng-v3.72.6-ios-tests.xcresult ]]
  mkdir -p "$result_bundle"
  printf 'fake result bundle\n' > "$result_bundle/result.txt"
  [[ "${IOS_TEST_XCODE_TEST_FAIL:-false}" != true ]]
elif [[ "$task" == 'build' ]]; then
  app="$derived_data/Build/Products/Release-iphonesimulator/SeerrNG.app"
  mkdir -p "$app"
  printf 'fake plist\n' > "$app/Info.plist"
else
  echo "Unexpected fake xcodebuild task: $task" >&2
  exit 1
fi
XCODEBUILD
cat > "$fake_bin/plutil" <<'PLUTIL'
#!/usr/bin/env bash
set -euo pipefail
exit 0
PLUTIL
cat > "$fake_bin/ditto" <<'DITTO'
#!/usr/bin/env bash
set -euo pipefail
[[ "${IOS_TEST_ARCHIVE_FAIL:-false}" != true ]]
destination="${@: -1}"
[[ "$destination" == "$SEERRNG_IOS_LOCAL_TEMP_ROOT"/* ]]
printf 'fake local archive\n' > "$destination"
DITTO
cat > "$fake_bin/shasum" <<'SHASUM'
#!/usr/bin/env bash
set -euo pipefail
[[ "$1" == '-a' && "$2" == '256' ]]
printf '0000000000000000000000000000000000000000000000000000000000000000  %s\n' "$3"
SHASUM
chmod +x "$fake_bin/xcodebuild" "$fake_bin/plutil" "$fake_bin/ditto" "$fake_bin/shasum"
PATH="$fake_bin:$PATH"
export PATH
SEERRNG_IOS_LOCAL_TEMP_ROOT="$local_root"
export SEERRNG_IOS_LOCAL_TEMP_ROOT

workspace="$(ios_release_create_local_workspace test)"
[[ "$workspace" == "$local_root"/seerrng-ios-test.* ]]
[[ -d "$workspace" ]]
rm -rf -- "$workspace"

if IOS_TEST_FILESYSTEM=nfs ios_release_create_local_workspace nfs > /dev/null 2>&1; then
  echo 'NFS storage was accepted for an Xcode workspace.' >&2
  exit 1
fi

if IOS_TEST_AVAILABLE_KIB=1000 ios_release_create_local_workspace low-space > /dev/null 2>&1; then
  echo 'An undersized local volume was accepted for an Xcode workspace.' >&2
  exit 1
fi

linked_root="$test_root/linked-apfs"
ln -s "$local_root" "$linked_root"
if SEERRNG_IOS_LOCAL_TEMP_ROOT="$linked_root" ios_release_create_local_workspace symlink > /dev/null 2>&1; then
  echo 'A symlinked Xcode workspace root was accepted.' >&2
  exit 1
fi

simulator_output="$test_root/simulator-output"
IOS_BUILD_NUMBER=1 bash "$script_dir/build-ios-release.sh" v3.72.6 "$simulator_output" > /dev/null
[[ -s "$simulator_output/seerrng-v3.72.6-ios-simulator.zip" ]]
[[ -s "$simulator_output/seerrng-v3.72.6-ios-simulator.sha256" ]]
[[ ! -e "$simulator_output/seerrng-v3.72.6-ios-tests.xcresult.zip" ]]

failure_output="$test_root/simulator-failure-output"
if IOS_TEST_XCODE_TEST_FAIL=true IOS_BUILD_NUMBER=1 \
  bash "$script_dir/build-ios-release.sh" v3.72.6 "$failure_output" > /dev/null 2>&1; then
  echo 'A failing simulator test was reported as a successful release build.' >&2
  exit 1
fi
[[ -s "$failure_output/seerrng-v3.72.6-ios-tests.xcresult.zip" ]]
[[ ! -e "$failure_output/seerrng-v3.72.6-ios-simulator.zip" ]]

retained_output="$test_root/retained-failure-output"
if IOS_TEST_XCODE_TEST_FAIL=true IOS_TEST_ARCHIVE_FAIL=true IOS_BUILD_NUMBER=1 \
  bash "$script_dir/build-ios-release.sh" v3.72.6 "$retained_output" \
  > "$test_root/retained-failure.log" 2>&1; then
  echo 'A failing diagnostic copy was reported as a successful release build.' >&2
  exit 1
fi
grep -Fq 'retained local workspace at' "$test_root/retained-failure.log"
retained_results=("$local_root"/seerrng-ios-build.*/seerrng-v3.72.6-ios-tests.xcresult/result.txt)
[[ ${#retained_results[@]} == 1 && -f "${retained_results[0]}" ]]

echo 'iOS release workspace guard checks passed.'
