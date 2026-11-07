#!/usr/bin/env bash
set -euo pipefail

output="${1:?Provide a task output directory}"
mkdir -p "$output"
output="$(cd "$output" && pwd)"
package=org.snapetech.seerrng

capture() {
  local source="$1" device mode
  adb shell pm clear "$package" >/dev/null
  for device in phone tablet; do
    if [[ "$device" == tablet ]]; then
      adb shell wm size 1280x800
      adb shell wm density 160
    else
      adb shell wm size reset
      adb shell wm density reset
    fi
    for mode in no yes; do
      adb shell cmd uimode night "$mode"
      adb shell am force-stop "$package"
      adb shell am start -W -n "$package/.MainActivity" >/dev/null
      sleep 2
      adb exec-out screencap -p > "$output/$source-$device-night-$mode.png"
      test -s "$output/$source-$device-night-$mode.png"
    done
  done
}

# Connected-test cleanup can uninstall the target package after its assertions.
adb install -r android/app/build/outputs/apk/debug/app-debug.apk >/dev/null
capture candidate

# Compare the actual published application, without rebuilding old source.
baseline=v3.72.16
apk="$output/seerrng-$baseline-android.apk"
url="https://github.com/snapetech-org/seerrng/releases/download/$baseline/seerrng-$baseline-android.apk"
curl --fail --location --retry 2 "$url" --output "$apk"
curl --fail --location --retry 2 "${url%.apk}.sha256" --output "$apk.sha256"
read -r expected _ < "$apk.sha256"
[[ "$expected" =~ ^[a-fA-F0-9]{64}$ ]]
printf '%s  %s\n' "$expected" "$apk" | sha256sum --check
adb uninstall "$package" >/dev/null
adb install "$apk" >/dev/null
capture baseline
adb shell wm size reset
adb shell wm density reset
adb shell cmd uimode night no
