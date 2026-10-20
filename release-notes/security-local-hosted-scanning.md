---
category: security
audience: operators
area: security
action: none
breaking: false
---
Local Semgrep and Trivy scans are available to maintainers, with hosted scans on main changes, pull requests, and weekly. pnpm package installs and normal Dependabot version updates now wait seven days after publication; Dependabot security updates remain immediate. The local development container now runs as the unprivileged `node` user.
