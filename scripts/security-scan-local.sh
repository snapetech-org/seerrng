#!/usr/bin/env bash
set -euo pipefail

repo_root="$(git rev-parse --show-toplevel)"
cd "$repo_root"
export EIO_BACKEND="${SEMGREP_EIO_BACKEND:-posix}"
mode="all"
staged=0
ci_mode=0
security_scan_temp_dirs=()

cleanup_security_scan_temp_dirs() {
  local dir
  for dir in "${security_scan_temp_dirs[@]}"; do
    rm -rf -- "$dir"
  done
}
trap cleanup_security_scan_temp_dirs EXIT

while (($#)); do
  case "$1" in
    --staged) staged=1 ;;
    --semgrep-only)
      [[ "$mode" == all || "$mode" == semgrep ]] || { echo "Choose only one scanner." >&2; exit 2; }
      mode=semgrep ;;
    --trivy-only)
      [[ "$mode" == all || "$mode" == trivy ]] || { echo "Choose only one scanner." >&2; exit 2; }
      mode=trivy ;;
    --ci) ci_mode=1 ;;
    -h|--help)
      cat <<'HELP'
Usage: scripts/security-scan-local.sh [--staged] [--semgrep-only|--trivy-only] [--ci]

Semgrep uses the local Community Edition engine with p/default and metrics off.
Trivy selects secret, dependency, and IaC scanners from files in this repository.
Findings are report-only by default. Set SEMGREP_FAIL_ON_FINDINGS=1 or
TRIVY_EXIT_CODE=1 to make findings fail the command. --ci disables repository-
controlled Trivy config and ignore files. --staged scans only staged Semgrep files.
HELP
      exit 0 ;;
    *) echo "Unknown option: $1" >&2; exit 2 ;;
  esac
  shift
done
if (( staged )) && [[ "$mode" == trivy ]]; then
  echo "Trivy scans the checkout, not the staged index; omit --staged for Trivy." >&2
  exit 2
fi

semgrep_globs=('*.py' '*.js' '*.jsx' '*.ts' '*.tsx' '*.mjs' '*.cjs' '*.go' '*.rs' '*.java' '*.kt' '*.kts' '*.cs' '*.c' '*.h' '*.cc' '*.cpp' '*.hpp' '*.php' '*.rb' '*.swift' '*.sh' '*.bash' '*.zsh' '*.ps1' '*.sql' '*.scala' '*.ex' '*.exs' '*.tf' 'Dockerfile*' '*/Dockerfile*' 'docker-compose*.yml' '*/docker-compose*.yml' 'docker-compose*.yaml' '*/docker-compose*.yaml' 'compose*.yml' '*/compose*.yml' 'compose*.yaml' '*/compose*.yaml' '.github/workflows/*.yml' '.github/workflows/*.yaml' 'k8s/*.yml' 'k8s/**/*.yml' 'k8s/*.yaml' 'k8s/**/*.yaml' 'helm/*.yml' 'helm/**/*.yml' 'helm/*.yaml' 'helm/**/*.yaml' 'charts/*.yml' 'charts/**/*.yml' 'charts/*.yaml' 'charts/**/*.yaml' 'deploy/*.yml' 'deploy/**/*.yml' 'deploy/*.yaml' 'deploy/**/*.yaml' 'infra/*.yml' 'infra/**/*.yml' 'infra/*.yaml' 'infra/**/*.yaml')

dependency_globs=('package.json' '*/package.json' 'package-lock.json' '*/package-lock.json' 'pnpm-lock.yaml' '*/pnpm-lock.yaml' 'yarn.lock' '*/yarn.lock' 'bun.lock*' '*/bun.lock*' 'Cargo.toml' '*/Cargo.toml' 'Cargo.lock' '*/Cargo.lock' 'go.mod' '*/go.mod' 'go.sum' '*/go.sum' 'pyproject.toml' '*/pyproject.toml' 'requirements*.txt' '*/requirements*.txt' 'uv.lock' '*/uv.lock' 'poetry.lock' '*/poetry.lock' 'Pipfile*' '*/Pipfile*' '*.csproj' '*.sln' 'pom.xml' '*/pom.xml' 'build.gradle' '*/build.gradle' 'build.gradle.kts' '*/build.gradle.kts' 'gradle.lockfile' '*/gradle.lockfile' 'Gemfile*' '*/Gemfile*' 'composer.json' '*/composer.json' 'composer.lock' '*/composer.lock' 'mix.lock' '*/mix.lock' 'pubspec.yaml' '*/pubspec.yaml')

iac_globs=('Dockerfile' '*/Dockerfile' 'Dockerfile.*' '*/Dockerfile.*' 'docker-compose*.yml' '*/docker-compose*.yml' 'docker-compose*.yaml' '*/docker-compose*.yaml' 'compose*.yml' '*/compose*.yml' 'compose*.yaml' '*/compose*.yaml' '*.tf' '*.tfvars' 'Chart.yaml' '*/Chart.yaml' 'kustomization.yaml' '*/kustomization.yaml' '.github/workflows/*.yml' '.github/workflows/*.yaml' 'k8s/*.yml' 'k8s/**/*.yml' 'k8s/*.yaml' 'k8s/**/*.yaml' 'helm/*.yml' 'helm/**/*.yml' 'helm/*.yaml' 'helm/**/*.yaml' 'charts/*.yml' 'charts/**/*.yml' 'charts/*.yaml' 'charts/**/*.yaml' 'deploy/*.yml' 'deploy/**/*.yml' 'deploy/*.yaml' 'deploy/**/*.yaml' 'infra/*.yml' 'infra/**/*.yml' 'infra/*.yaml' 'infra/**/*.yaml')

repository_has_file_matching() {
  local file pattern
  local patterns=("$@")
  while IFS= read -r -d '' file; do
    case "$file" in
      docs/*|*/docs/*|.husky/*|*/.husky/*|.githooks/*|*/.githooks/*|scripts/security-scan-local.sh|*/scripts/security-scan-local.sh|scripts/update-security-tools.sh|*/scripts/update-security-tools.sh|scripts/install-security-hooks.sh|*/scripts/install-security-hooks.sh)
        continue ;;
    esac
    for pattern in "${patterns[@]}"; do
      # Intentional glob matching against the fixed patterns above.
      # shellcheck disable=SC2053
      if [[ "$file" == $pattern ]]; then
        return 0
      fi
    done
  done < <(git ls-files --cached --others --exclude-standard -z)
  return 1
}

has_semgrep_input() {
  repository_has_file_matching "${semgrep_globs[@]}"
}

semgrep_run() {
  local args=(scan --config "${SEMGREP_CONFIG:-p/default}" --metrics=off --jobs "${SEMGREP_JOBS:-2}")
  local targets=()
  local staged_files=()
  local staged_dir=""
  if [[ "${SEMGREP_OFFLINE:-0}" == 1 ]]; then
    args+=(--disable-version-check)
  fi
  if [[ "${SEMGREP_FAIL_ON_FINDINGS:-0}" == 1 ]]; then
    args+=(--error)
  fi
  if (( staged )); then
    staged_dir="$(mktemp -d "${TMPDIR:-/tmp}/seerrng-semgrep-staged.XXXXXX")"
    security_scan_temp_dirs+=("$staged_dir")
    while IFS= read -r -d '' file; do
      case "$file" in
        *.py|*.js|*.jsx|*.ts|*.tsx|*.mjs|*.cjs|*.go|*.rs|*.java|*.kt|*.kts|*.cs|*.c|*.h|*.cc|*.cpp|*.hpp|*.php|*.rb|*.swift|*.sh|*.bash|*.zsh|*.ps1|*.sql|*.scala|*.ex|*.exs|*.tf|Dockerfile|Dockerfile.*|docker-compose*.yml|docker-compose*.yaml|compose*.yml|compose*.yaml|*.yml|*.yaml)
          ;;
        *) continue ;;
      esac
      local index_entry index_mode target
      index_entry="$(git ls-files --stage -- "$file")"
      index_mode="${index_entry%% *}"
      if [[ "$index_mode" == 120000 ]]; then
        continue
      fi
      target="$staged_dir/$file"
      mkdir -p -- "$(dirname -- "$target")"
      if ! git show ":$file" > "$target"; then
        echo "Semgrep: could not read staged file: $file" >&2
        return 1
      fi
      staged_files+=("$file")
      targets+=("$target")
    done < <(git diff --cached --name-only --diff-filter=ACMR -z)
    if ((${#targets[@]} == 0)); then
      echo "Semgrep: no staged source or configuration files; skipped."
      return 0
    fi
  else
    if ! has_semgrep_input; then
      echo "Semgrep: no supported source or configuration files in this repository; skipped."
      return 0
    fi
    targets=(.)
  fi

  echo "Semgrep Community Edition: config=${SEMGREP_CONFIG:-p/default}, targets=${#targets[@]}"
  if [[ -n "${SEMGREP_BIN:-}" ]]; then
    [[ -x "$SEMGREP_BIN" ]] || { echo "SEMGREP_BIN is not executable: $SEMGREP_BIN" >&2; return 127; }
    "$SEMGREP_BIN" "${args[@]}" "${targets[@]}"
  elif command -v uvx >/dev/null 2>&1; then
    local uv_args=()
    [[ "${SEMGREP_OFFLINE:-0}" == 1 ]] && uv_args+=(--offline)
    uvx "${uv_args[@]}" --from semgrep semgrep "${args[@]}" "${targets[@]}"
  elif command -v semgrep >/dev/null 2>&1; then
    semgrep "${args[@]}" "${targets[@]}"
  elif command -v docker >/dev/null 2>&1; then
    local image="semgrep/semgrep:latest"
    local docker_args=("${args[@]}")
    local volume_args=(-v "$repo_root:/src:ro" -w /src)
    local docker_targets=(.)
    if (( staged )); then
      volume_args+=(-v "$staged_dir:/staged:ro")
      docker_targets=()
      local file
      for file in "${staged_files[@]}"; do
        docker_targets+=("/staged/$file")
      done
    fi
    if [[ -n "${SEMGREP_CONFIG:-}" && -e "$SEMGREP_CONFIG" ]]; then
      local config_path config_dir config_name
      config_dir="$(cd -- "$(dirname -- "$SEMGREP_CONFIG")" && pwd -P)"
      config_name="$(basename -- "$SEMGREP_CONFIG")"
      config_path="$config_dir/$config_name"
      if [[ -d "$config_path" ]]; then
        volume_args+=(-v "$config_path:/semgrep-config:ro")
        docker_args[2]="/semgrep-config"
      else
        volume_args+=(-v "$config_path:/semgrep-config/rules:ro")
        docker_args[2]="/semgrep-config/rules"
      fi
    fi
    if ! docker image inspect "$image" >/dev/null 2>&1; then
      [[ "${SEMGREP_OFFLINE:-0}" == 0 ]] || { echo "Semgrep image is not cached for offline mode." >&2; return 127; }
      docker pull "$image"
    fi
    docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp -e "EIO_BACKEND=$EIO_BACKEND" \
      "${volume_args[@]}" "$image" semgrep "${docker_args[@]}" "${docker_targets[@]}"
  else
    echo "Semgrep is unavailable. Install uv, pipx, Semgrep, or Docker." >&2
    return 127
  fi
}

has_dependency_files() {
  repository_has_file_matching "${dependency_globs[@]}"
}
has_iac_files() {
  repository_has_file_matching "${iac_globs[@]}"
}
has_code_files() {
  repository_has_file_matching "${semgrep_globs[@]}"
}

trivy_run() {
  local scanners=() dir
  local args=()
  if has_dependency_files; then scanners+=(vuln); fi
  if has_iac_files; then scanners+=(misconfig); fi
  if has_code_files || ((${#scanners[@]} > 0)); then scanners+=(secret); fi
  if ((${#scanners[@]} == 0)); then
    echo "Trivy: no source, dependency, or deployment files; skipped."
    return 0
  fi
  local scanner_list
  local scanner
  scanner_list="${scanners[0]}"
  for scanner in "${scanners[@]:1}"; do
    scanner_list+=",${scanner}"
  done
  args+=(fs --scanners "$scanner_list" --timeout "${TRIVY_TIMEOUT:-20m}" --severity 'HIGH,CRITICAL' --ignore-unfixed --exit-code "${TRIVY_EXIT_CODE:-0}")
  for dir in .git node_modules vendor target dist build coverage .venv .bookshelf-migration-lab; do args+=(--skip-dirs "$dir"); done
  while IFS= read -r -d '' dir; do
    dir="${dir#./}"
    [[ "$dir" == node_modules ]] || args+=(--skip-dirs "$dir")
  done < <(find . -type d \( -path './.git' -o -path './.bookshelf-migration-lab' \) -prune -o -type d \( -name node_modules -o -name dist -o -name build -o -name coverage -o -name target -o -name .venv \) -prune -print0)
  if (( ci_mode )); then args+=(--config= --ignorefile= --secret-config=); fi
  if [[ "${TRIVY_OFFLINE:-0}" == 1 ]]; then args+=(--skip-db-update --skip-java-db-update --skip-check-update); fi

  echo "Trivy filesystem scan: scanners=$scanner_list"
  if command -v trivy >/dev/null 2>&1; then
    trivy "${args[@]}" .
  elif command -v docker >/dev/null 2>&1; then
    local image="aquasec/trivy:latest"
    local cache_dir="${TRIVY_CACHE_DIR:-${XDG_CACHE_HOME:-$HOME/.cache}/trivy}"
    mkdir -p "$cache_dir"
    if ! docker image inspect "$image" >/dev/null 2>&1; then
      [[ "${TRIVY_OFFLINE:-0}" == 0 ]] || { echo "Trivy image is not cached for offline mode." >&2; return 127; }
      docker pull "$image"
    fi
    docker run --rm --user "$(id -u):$(id -g)" -e HOME=/tmp -e TRIVY_CACHE_DIR=/cache \
      -v "$repo_root:/src:ro" -v "$cache_dir:/cache" -w /src "$image" "${args[@]}" .
  else
    echo "Trivy is unavailable; install Trivy or Docker to run this project scan." >&2
    [[ "${REQUIRE_TRIVY:-0}" == 1 ]] && return 127
  fi
}

if [[ "$mode" != trivy ]]; then
  semgrep_run
fi
if [[ "$mode" != semgrep ]] && (( ! staged )); then trivy_run; fi
