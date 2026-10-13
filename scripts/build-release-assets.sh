#!/usr/bin/env bash
set -euo pipefail
umask 077

tag="${1:?usage: build-release-assets.sh <tag> <dist-dir>}"
dist_dir="${2:-dist-release}"
[[ "$tag" =~ ^v[0-9][0-9A-Za-z._+-]{0,127}$ ]] || {
  echo "Invalid release tag: $tag" >&2
  exit 2
}
[[ ! -L "$dist_dir" ]] || {
  echo "Refusing symlink distribution directory: $dist_dir" >&2
  exit 2
}
mkdir -p -- "$dist_dir"
dist_abs="$(cd "$dist_dir" && pwd -P)"

case "$(uname -s)" in
  Linux) os=linux ;;
  Darwin) os=macos ;;
  MINGW*|MSYS*|CYGWIN*) os=windows ;;
  *) echo "Unsupported OS: $(uname -s)" >&2; exit 1 ;;
esac

runtime_arch="$(node -p 'process.arch')"
case "$runtime_arch" in
  x64|arm64) arch="$runtime_arch" ;;
  *)
    echo "Unsupported release architecture reported by Node.js: $runtime_arch" >&2
    exit 1
    ;;
esac
requested_arch="${SEERRNG_RELEASE_ARCH:-$arch}"
case "$requested_arch" in
  x64|arm64) ;;
  *)
    echo "Unsupported requested release architecture: $requested_arch" >&2
    exit 1
    ;;
esac
[[ "$requested_arch" == "$arch" ]] || {
  echo "Release architecture mismatch: requested $requested_arch, runner Node.js reports $arch" >&2
  exit 1
}
arch="$requested_arch"

asset="seerrng-${tag}-${os}-${arch}"
work_dir="$(mktemp -d)"
work_dir="$(cd "$work_dir" && pwd -P)"
archive_temporary=""
checksum_temporary=""
cleanup() {
  rm -rf -- "$work_dir"
  [[ -z "$archive_temporary" ]] || rm -f -- "$archive_temporary"
  [[ -z "$checksum_temporary" ]] || rm -f -- "$checksum_temporary"
}
trap cleanup EXIT

time_phase() {
  local release_phase="$1"
  shift
  local phase_started_at phase_elapsed
  phase_started_at="$(date +%s)"
  printf 'Starting release archive phase: %s\n' "$release_phase"
  "$@"
  phase_elapsed="$(( $(date +%s) - phase_started_at ))"
  printf 'Completed release archive phase: %s in %ss\n' "$release_phase" "$phase_elapsed"
}

stage="${work_dir}/${asset}"
mkdir -p "$stage"

if ! command -v pnpm >/dev/null 2>&1 && command -v corepack >/dev/null 2>&1; then
  corepack enable
fi
command -v pnpm >/dev/null 2>&1 || {
  echo "pnpm or Corepack is required to build release assets" >&2
  exit 127
}
time_phase 'Install build dependencies' env CI=true CYPRESS_INSTALL_BINARY=0 pnpm install --frozen-lockfile
time_phase 'Build application' pnpm build

# Next's build cache and development output are not runtime content. Removing
# them before staging avoids copying gigabytes of transient files, which is
# especially slow under Git Bash on Windows runners.
rm -rf -- .next/cache .next/dev
time_phase 'Copy built runtime files' cp -R .next dist public "$stage"/
time_phase 'Copy runtime metadata' cp package.json pnpm-lock.yaml pnpm-workspace.yaml next.config.mjs seerr-api.yml LICENSE "$stage"/
mkdir -p "$stage/bin"
cp bin/prepare.mjs "$stage/bin/"
# pnpm-workspace.yaml pins checked-in patches that are required when the
# production dependency tree is installed inside the staged archive.
cp -R patches "$stage/"
(
  cd "$stage"
  time_phase 'Install staged production dependencies' env CI=true CYPRESS_INSTALL_BINARY=0 pnpm install --prod --frozen-lockfile
)
rm -rf "${stage:?}/.next/cache" "${stage:?}/.next/dev" "${stage:?}/bin" "${stage:?}/cache" "${stage:?}/patches"
mkdir -p "$stage/config"
touch "$stage/config/.gitkeep"

# Keep symlink validation in one Node process instead of spawning several Git
# Bash utilities for every link in the large Windows ARM64 tree.
time_phase 'Validate and normalize runtime symlinks' node --input-type=module - "$stage" <<'NODE'
import fs from 'node:fs/promises';
import path from 'node:path';

const stage = await fs.realpath(process.argv[2]);
const pendingDirectories = [stage];

function isInsideStage(target) {
  const relative = path.relative(stage, target);
  return (
    relative !== '..' &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

while (pendingDirectories.length > 0) {
  const directory = pendingDirectories.pop();
  const entries = await fs.readdir(directory, { withFileTypes: true });

  for (const entry of entries) {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      pendingDirectories.push(entryPath);
      continue;
    }
    if (!entry.isSymbolicLink()) continue;

    const target = await fs.readlink(entryPath);
    let resolved;
    try {
      resolved = await fs.realpath(entryPath);
    } catch {
      throw new Error(`Refusing broken archive symlink: ${entryPath} -> ${target}`);
    }
    if (!isInsideStage(resolved)) {
      const kind = path.isAbsolute(target) ? 'absolute' : 'escaping';
      throw new Error(`Refusing ${kind} archive symlink: ${entryPath} -> ${target}`);
    }

    if (path.isAbsolute(target)) {
      const relativeTarget = path.relative(path.dirname(entryPath), resolved);
      const targetType =
        process.platform === 'win32' && (await fs.stat(resolved)).isDirectory()
          ? 'dir'
          : 'file';
      await fs.unlink(entryPath);
      await fs.symlink(
        relativeTarget,
        entryPath,
        process.platform === 'win32' ? targetType : undefined
      );
    }
  }
}
NODE

cat > "$stage/start.sh" <<'EOF'
#!/usr/bin/env sh
set -eu
script_dir="$(CDPATH= cd -- "$(dirname -- "$0")" && pwd)"
cd "$script_dir"
export NODE_ENV="${NODE_ENV:-production}"
export CONFIG_DIRECTORY="${CONFIG_DIRECTORY:-${script_dir}/config}"
exec node dist/index.js "$@"
EOF
chmod 0755 "$stage/start.sh"

cat > "$stage/start.cmd" <<'EOF'
@echo off
set NODE_ENV=production
cd /d "%~dp0"
if "%CONFIG_DIRECTORY%"=="" set CONFIG_DIRECTORY=%CD%\config
node dist\index.js %*
EOF

cat > "$stage/seerrng" <<'EOF'
#!/usr/bin/env sh
set -eu
exec "$(dirname "$0")/start.sh" "$@"
EOF
chmod 0755 "$stage/seerrng"
cp "$stage/start.cmd" "$stage/seerrng.cmd"

# POSIX archives need normalized modes because this build uses a restrictive
# umask. Windows extracts with NTFS ACLs and launches through start.cmd, so a
# recursive chmod of every staged file adds no runtime value there.
if [[ "$os" == 'windows' ]]; then
  echo 'Skipping recursive POSIX permission normalization for the Windows archive.'
else
  time_phase 'Normalize runtime permissions' chmod -R u=rwX,go=rX "$stage"
fi

if [[ "$os" == "windows" ]]; then
  archive_name="${asset}.zip"
  archive_phase_started_at="$(date +%s)"
  echo 'Starting release archive phase: Create Windows ZIP'
  archive_temporary="$(mktemp "${dist_abs}/.${archive_name}.tmp.XXXXXX.zip")"
  rm -f -- "$archive_temporary"
  if command -v 7z >/dev/null 2>&1; then
    # PowerShell Compress-Archive is prohibitively slow for the staged
    # Next.js runtime on GitHub's Windows runners. Use 7-Zip's fast Deflate
    # level and parallel workers to keep native ARM packaging practical.
    (cd "$work_dir" && 7z a -tzip -mx=1 -mmt=on -bsp1 -bso0 -bse2 "$archive_temporary" "$asset")
  elif command -v zip >/dev/null 2>&1; then
    (cd "$work_dir" && zip -qr "$archive_temporary" "$asset")
  elif command -v tar >/dev/null 2>&1; then
    # Windows' built-in tar is bsdtar and supports ZIP output via -a. Keep
    # this before the PowerShell fallback for installations without 7-Zip.
    (cd "$work_dir" && tar -a -cf "$archive_temporary" "$asset")
  elif command -v powershell.exe >/dev/null 2>&1; then
    if command -v cygpath >/dev/null 2>&1; then
      powershell_source="$(cygpath -w "${work_dir}/${asset}")"
      powershell_archive="$(cygpath -w "$archive_temporary")"
    else
      powershell_source="${work_dir}/${asset}"
      powershell_archive="$archive_temporary"
    fi
    # PowerShell expands these environment variables.
    # shellcheck disable=SC2016
    POWERSHELL_SOURCE="$powershell_source" POWERSHELL_ARCHIVE="$powershell_archive" \
      powershell.exe -NoProfile -Command \
      'Compress-Archive -LiteralPath $env:POWERSHELL_SOURCE -DestinationPath $env:POWERSHELL_ARCHIVE -Force'
  elif command -v powershell >/dev/null 2>&1; then
    # PowerShell expands these environment variables.
    # shellcheck disable=SC2016
    POWERSHELL_SOURCE="${work_dir}/${asset}" POWERSHELL_ARCHIVE="$archive_temporary" \
      powershell -NoProfile -Command \
      'Compress-Archive -LiteralPath $env:POWERSHELL_SOURCE -DestinationPath $env:POWERSHELL_ARCHIVE -Force'
  else
    echo "zip or PowerShell Compress-Archive is required to build Windows assets" >&2
    exit 1
  fi
else
  archive_name="${asset}.tar.gz"
  archive_phase_started_at="$(date +%s)"
  echo 'Starting release archive phase: Create POSIX tarball'
  archive_temporary="$(mktemp "${dist_abs}/.${archive_name}.tmp.XXXXXX.tar.gz")"
  tar -C "$work_dir" -czf "$archive_temporary" "$asset"
fi

chmod 0644 "$archive_temporary"
mv -f -- "$archive_temporary" "${dist_abs}/${archive_name}"
archive_bytes="$(wc -c < "${dist_abs}/${archive_name}" | tr -d '[:space:]')"
printf 'Completed release archive phase: Create %s in %ss (%s bytes)\n' \
  "$archive_name" "$(( $(date +%s) - archive_phase_started_at ))" "$archive_bytes"
checksum_temporary="$(mktemp "${dist_abs}/.${asset}.sha256.tmp.XXXXXX")"
(cd "$dist_abs" && sha256sum "$archive_name" >"$checksum_temporary")
chmod 0644 "$checksum_temporary"
mv -f -- "$checksum_temporary" "${dist_abs}/${asset}.sha256"
