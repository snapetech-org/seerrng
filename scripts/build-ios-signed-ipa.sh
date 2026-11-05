#!/usr/bin/env bash
set -euo pipefail

tag="${1:?Usage: IOS_DISTRIBUTION_KIND=adhoc|app-store-connect build-ios-signed-ipa.sh vX.Y.Z [output-directory]}"
output_dir="${2:-dist-release}"
kind="${IOS_DISTRIBUTION_KIND:-}"
bundle_id='org.snapetech.seerrng.ios'

if [[ ! "$tag" =~ ^v(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)\.(0|[1-9][0-9]*)(-[0-9A-Za-z.-]+)?$ ]]; then
  echo "iOS release tag must be a semantic version: $tag" >&2
  exit 2
fi
if [[ "$kind" != 'adhoc' && "$kind" != 'app-store-connect' ]]; then
  echo "IOS_DISTRIBUTION_KIND must be 'adhoc' or 'app-store-connect'." >&2
  exit 2
fi

short_version="${tag#v}"
short_version="${short_version%%-*}"
build_number="${IOS_BUILD_NUMBER:-${GITHUB_RUN_NUMBER:-1}}"
if [[ ! "$build_number" =~ ^[1-9][0-9]*$ ]]; then
  echo "IOS_BUILD_NUMBER must be a positive integer: $build_number" >&2
  exit 2
fi

for name in IOS_DISTRIBUTION_CERTIFICATE_BASE64 IOS_DISTRIBUTION_CERTIFICATE_PASSWORD IOS_TEAM_ID; do
  if [[ -z "${!name:-}" ]]; then
    echo "Missing required iOS signing secret: $name" >&2
    exit 2
  fi
done
case "$kind" in
  adhoc)
    profile_secret='IOS_ADHOC_PROVISIONING_PROFILE_BASE64'
    output_kind='adhoc'
    export_method='ad-hoc'
    ;;
  app-store-connect)
    profile_secret='IOS_APPSTORE_PROVISIONING_PROFILE_BASE64'
    output_kind='appstore'
    export_method='app-store-connect'
    ;;
esac
if [[ -z "${!profile_secret:-}" ]]; then
  echo "Missing required iOS signing secret: $profile_secret" >&2
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
build_dir="$(ios_release_create_local_workspace signing)"
mkdir -m 700 "$build_dir/tmp"
export TMPDIR="$build_dir/tmp"
keychain="$build_dir/seerrng-signing.keychain-db"
certificate="$build_dir/distribution.p12"
profile="$build_dir/profile.mobileprovision"
original_keychain="$(security default-keychain -d user | sed -e 's/^[[:space:]]*"//' -e 's/"[[:space:]]*$//')"
profile_destination=''
profile_was_present=false
keychain_password="$(openssl rand -hex 32)"

cleanup() {
  if [[ -n "$profile_destination" ]]; then
    if [[ "$profile_was_present" == true ]]; then
      cp -- "$build_dir/preexisting-profile.mobileprovision" "$profile_destination"
    else
      rm -f -- "$profile_destination"
    fi
  fi
  if [[ -n "$original_keychain" ]]; then
    security default-keychain -d user -s "$original_keychain" >/dev/null 2>&1 || true
  fi
  security delete-keychain "$keychain" >/dev/null 2>&1 || true
  rm -rf -- "$build_dir"
}
trap cleanup EXIT
chmod 700 "$build_dir"
printf '%s' "$IOS_DISTRIBUTION_CERTIFICATE_BASE64" | base64 -D > "$certificate"
printf '%s' "${!profile_secret}" | base64 -D > "$profile"
chmod 600 "$certificate" "$profile"
test -s "$certificate"
test -s "$profile"

security cms -D -i "$profile" > "$build_dir/profile.plist"
profile_uuid="$(/usr/libexec/PlistBuddy -c 'Print :UUID' "$build_dir/profile.plist")"
profile_name="$(/usr/libexec/PlistBuddy -c 'Print :Name' "$build_dir/profile.plist")"
profile_team="$(/usr/libexec/PlistBuddy -c 'Print :TeamIdentifier:0' "$build_dir/profile.plist")"
profile_app_id="$(/usr/libexec/PlistBuddy -c 'Print :Entitlements:application-identifier' "$build_dir/profile.plist")"
if [[ "$profile_team" != "$IOS_TEAM_ID" || "$profile_app_id" != "$IOS_TEAM_ID.$bundle_id" ]]; then
  echo 'Provisioning profile team or bundle identifier does not match this app.' >&2
  exit 2
fi
if [[ "$kind" == 'adhoc' ]] && ! /usr/libexec/PlistBuddy -c 'Print :ProvisionedDevices' "$build_dir/profile.plist" >/dev/null 2>&1; then
  echo 'The Ad Hoc profile has no registered devices. Add device UDIDs and regenerate it.' >&2
  exit 2
fi
if [[ "$kind" == 'app-store-connect' ]] && /usr/libexec/PlistBuddy -c 'Print :ProvisionedDevices' "$build_dir/profile.plist" >/dev/null 2>&1; then
  echo 'The App Store profile must be an App Store distribution profile, not Ad Hoc.' >&2
  exit 2
fi

mkdir -p "$HOME/Library/MobileDevice/Provisioning Profiles" "$output_dir"
profile_destination="$HOME/Library/MobileDevice/Provisioning Profiles/$profile_uuid.mobileprovision"
if [[ -e "$profile_destination" ]]; then
  cp -- "$profile_destination" "$build_dir/preexisting-profile.mobileprovision"
  profile_was_present=true
else
  profile_was_present=false
fi
cp -- "$profile" "$profile_destination"
security create-keychain -p "$keychain_password" "$keychain"
security set-keychain-settings -lut 21600 "$keychain"
security unlock-keychain -p "$keychain_password" "$keychain"
security default-keychain -d user -s "$keychain"
security import "$certificate" -k "$keychain" -P "$IOS_DISTRIBUTION_CERTIFICATE_PASSWORD" -T /usr/bin/codesign -T /usr/bin/security >/dev/null
security set-key-partition-list -S apple-tool:,apple:,codesign: -s -k "$keychain_password" "$keychain" >/dev/null

python3 - "$export_method" "$IOS_TEAM_ID" "$profile_name" "$bundle_id" "$build_dir/ExportOptions.plist" <<'PY'
import plistlib
import sys

export_method, team, profile, bundle_id, path = sys.argv[1:]
document = {
    "method": export_method,
    "signingStyle": "manual",
    "teamID": team,
    "provisioningProfiles": {bundle_id: profile},
    "stripSwiftSymbols": True,
    "uploadSymbols": False,
}
with open(path, "wb") as output:
    plistlib.dump(document, output)
PY

xcodebuild \
  -project 'ios/SeerrNG.xcodeproj' \
  -scheme SeerrNG \
  -configuration Release \
  -destination 'generic/platform=iOS' \
  -derivedDataPath "$build_dir/DerivedData" \
  -archivePath "$build_dir/SeerrNG.xcarchive" \
  MARKETING_VERSION="$short_version" \
  CURRENT_PROJECT_VERSION="$build_number" \
  CODE_SIGN_STYLE=Manual \
  CODE_SIGN_IDENTITY='Apple Distribution' \
  DEVELOPMENT_TEAM="$IOS_TEAM_ID" \
  PROVISIONING_PROFILE="$profile_uuid" \
  PROVISIONING_PROFILE_SPECIFIER="$profile_name" \
  CODE_SIGNING_ALLOWED=YES \
  archive

export_dir="$build_dir/export"
xcodebuild \
  -exportArchive \
  -archivePath "$build_dir/SeerrNG.xcarchive" \
  -exportPath "$export_dir" \
  -exportOptionsPlist "$build_dir/ExportOptions.plist"

ipa="$export_dir/SeerrNG.ipa"
test -s "$ipa"
unzip -q "$ipa" 'Payload/SeerrNG.app/*' -d "$build_dir/ipa-check"
app="$build_dir/ipa-check/Payload/SeerrNG.app"
test -d "$app"
codesign --verify --deep --strict "$app"
archive="seerrng-${tag}-ios-${output_kind}.ipa"
cp -- "$ipa" "$output_dir/$archive"
checksum="${archive%.ipa}.sha256"
(cd "$output_dir" && shasum -a 256 "$archive" > "$checksum")
echo "Built signed iOS $kind package: $output_dir/$archive"
if [[ "$kind" == 'adhoc' ]]; then
  echo 'This IPA only installs on devices listed in the embedded Ad Hoc provisioning profile.'
else
  echo 'This IPA is for App Store Connect or TestFlight upload; it is not a direct-install package.'
fi
