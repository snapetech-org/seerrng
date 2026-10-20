# Security scanning

Run `./scripts/security-scan-local.sh` to scan this checkout locally. Semgrep Community Edition uses the free `p/default` community rules with metrics disabled; the source stays on the machine. The rule pack is fetched from the public Semgrep Registry when it is missing or refreshed, so the first scan needs network access. For a disconnected run, set `SEMGREP_CONFIG` to a local rules directory and `SEMGREP_OFFLINE=1` after caching the Semgrep package.

Semgrep runs on supported source and security configuration. It defaults to two worker jobs for memory-limited environments; set `SEMGREP_JOBS` to change that. Trivy selects `secret` for source/config, `vuln` when dependency manifests or lockfiles are present, and `misconfig` for container, workflow, Kubernetes, Helm, or Terraform files.

The installed pre-commit hook runs Semgrep on a snapshot of staged source/config files after lint-staged has completed. It reads staged Git objects, so unstaged edits cannot hide or introduce findings in the commit being checked. Trivy runs during full local scans and its configured CI workflow.

A public GitHub Actions job runs the current official Semgrep CE image on main changes, pull requests, and weekly. It refreshes `p/default` rules and retains JSON and SARIF reports as a 14-day workflow artifact for review. The report-only community rules are not uploaded wholesale to GitHub code scanning because broad rules can report context-specific matches that need triage.

The Trivy filesystem job runs on main changes, pull requests, and weekly. It uses the current Trivy release, refreshes its vulnerability database, and reports HIGH/CRITICAL findings while ignoring unfixed vulnerabilities. Generated dependency and build directories are skipped; lockfiles remain in scope. The ignored `.bookshelf-migration-lab` directory is also excluded because it contains local migration backups rather than source.

Scans report findings without failing by default so existing findings can be triaged. Set `SEMGREP_FAIL_ON_FINDINGS=1` or `TRIVY_EXIT_CODE=1` to make a local scan fail on findings. Trivy downloads its vulnerability and check databases automatically; use `TRIVY_OFFLINE=1` only after those databases are cached. The default timeout is 20 minutes for slow first downloads; set `TRIVY_TIMEOUT` to change it.

Run `./scripts/update-security-tools.sh` to refresh the local Semgrep package cache, pull the current Semgrep fallback image, and refresh Trivy's database. All three pnpm workspaces and Dependabot version updates use a seven-day release cooldown; Dependabot security updates remain unaffected. Public scan workflows use weekly schedules to exercise current scanner releases and rules. Existing private runner workflows retain their current version and runner policy.

Semgrep uses the POSIX I/O backend by default for compatibility with restricted Linux runners. Set `SEMGREP_EIO_BACKEND` only if your runner needs a different backend.
