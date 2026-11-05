# Attribution Notice

SeerrNG is a fork of [Seerr](https://github.com/seerr-team/seerr). Seerr is
itself built on work from the Overseerr and Jellyseerr projects.

The inherited application code, architecture, UI, documentation, and project
history remain attributed to their original authors and contributors under the
MIT license and any applicable third-party asset licenses.

Changes made after the SeerrNG fork are attributed as follows:

- Files inherited from Seerr and modified in SeerrNG are derivative work and are
  co-attributed to the upstream Seerr/Jellyseerr/Overseerr contributors and to
  snapetech and SeerrNG contributors for the fork-specific changes.
- Files, workflows, packaging, documentation, and assets created specifically
  for SeerrNG are attributed to snapetech and SeerrNG contributors unless they
  state another source or license.
- Third-party names, logos, APIs, package scopes, and service references remain
  the property of their respective owners.

Do not replace upstream attribution on inherited material. When adding fresh
SeerrNG-specific files or repo metadata, avoid presenting them as upstream
Seerr project output unless the content is explicitly documenting upstream
behavior or compatibility.

The `RemapOverseerrDeletedStatus` migration files are imported from upstream
Seerr to preserve compatibility with databases created there. Their migration
names and source issue links are retained intentionally.

## Individual episode availability

SeerrNG's per-episode availability feature is an independent implementation
adapting proposals from Seerr [PR #1671](https://github.com/seerr-team/seerr/pull/1671),
[PR #3355](https://github.com/seerr-team/seerr/pull/3355),
[PR #3361](https://github.com/seerr-team/seerr/pull/3361),
[PR #3527](https://github.com/seerr-team/seerr/pull/3527), and
[PR #3402](https://github.com/seerr-team/seerr/pull/3402). The SeerrNG-specific
implementation and maintenance are attributed to snapetech and SeerrNG
contributors. It adds source-scoped reconciliation and per-library episode
order configuration while preserving separate standard and 4K states.

## Seerr and SeerrNG migration utility

The bidirectional migration utility, its tests, and its operating guide are
SeerrNG-specific work attributed to snapetech and SeerrNG contributors. Its
compatibility rules are based on the public Seerr settings and database shape;
the utility itself is new SeerrNG work.

## Foreseerr provider integrations

The Trakt, AniList, Simkl and MDBList clients and Trakt list pagination helpers
are adapted from [selmant/foreseerr](https://github.com/selmant/foreseerr),
revision `3fc9bdf47f99db32c2e777a4bbd6d8d6262a4ae3`.
Copyright (c) 2026 Selman Trabzon. The original MIT license is retained in
[`licenses/foreseerr-MIT.txt`](licenses/foreseerr-MIT.txt). SeerrNG changes are
attributed to snapetech and SeerrNG contributors.
