# Candidate-free packet: SeerrNG PR #418 main-sync strings

Exact review input head: `ca2309e960733a7486c55b9a761d82771be97cde`
Tree: `8c5df06aaf1d703ff923bf1fdf8a21c901b9d26d`
Base `main`: `2dea00ff2c533831bcab973c017b72052eb30d9b`

This packet contains eight English source IDs, each production caller context, per-source and per-caller hashes, and target-cell presence pins for the 12 direct locales. All 96 target cells were absent at the exact review head. It contains no proposed or existing target translations.

Preserve technical content exactly: `SeerrNG`, `X-Forwarded-For`, `IPv4`, `IPv6`, `CIDR`, the two CIDR examples, numeric limits (100 and 4096), and the Jellyfin product name and Quick Connect product term. `Trust Reverse Proxy` is an existing localized UI setting label; translate its meaning naturally rather than forcing the English label. Review the Settings > Network and Settings > Users contexts; preserve the distinction between interactive administrator sign-in, regular-user remote sign-in, and API-key integrations.
