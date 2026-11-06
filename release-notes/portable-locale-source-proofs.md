---
category: fixed
audience: operators
area: packaging
action: none
breaking: false
---
Locale source-proof paths now use canonical POSIX metadata rules on every platform while retaining filesystem containment checks. A Windows and Linux preflight validates the full localization and source-contract gates before release packaging.
