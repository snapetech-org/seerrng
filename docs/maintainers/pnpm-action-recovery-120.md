# pnpm action recovery — PR120

Closed [PR120](https://github.com/snapetech-org/seerrng/pull/120) proposed v6.1.0.
Commit a3dbde066 reverted it after the bootstrap failed switching pnpm11 to
10.24.0, even with an explicit version. That failed revision is not restored.

The replacement is [v6.1.1](https://github.com/pnpm/action-setup/releases/tag/v6.1.1),
pinned to commit73e46992e05b19abd31f2f3c20e0e7370d762115. GitHub verified its signed
annotated tag9bbca1e9dc2902adb87e8780fe5c98796985a62d as valid. The upstream
[Test Action](https://github.com/pnpm/action-setup/actions/runs/41647680309) and
[bundle check](https://github.com/pnpm/action-setup/actions/runs/41647679117)
passed on that exact revision.

Review covered the source, action input contract, committed bootstrap lockfiles,
cache-save changes, dependency changes and generated-bundle provenance. The
installer uses argument arrays, committed npm integrity records and a fixed
requested version. The pnpm12 native bootstrap branch does not change this
project's10.24.0 pin. The existing destination reset is limited here to the
runner-owned setup location; no repository-controlled destination input is added.
No permissions, secrets, runner access or install hooks are expanded.

A local execution of the actual distributed action on Node24.22.2 succeeded:
bootstrap11.28.10 switched to10.24.0, and the installed shim independently
reported10.24.0. Source archive and log are retained in the catalog-recovery
scratch evidence. This replaces the previously failing bootstrap behavior; it
does not upgrade the application's package manager. Main workflow qualification
and native release platform results must be recorded before declaring delivery
complete. CodeQL remains disabled.
