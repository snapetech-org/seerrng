---
title: Why SeerrNG Is a Fork
description: SeerrNG's purpose, cross-media scope, upstream relationship, and the conditions that could let upstream equivalents replace the fork.
---

# Why SeerrNG Is a Fork

**Confidence:** High for SeerrNG's stated purpose and the integrations documented
in this repository. Whether an upstream project will accept any particular
change is unknown and remains that project's decision.

## Purpose

SeerrNG is a maintained fork of Seerr. We forked to move quickly on a broad
expansion beyond movies and television, and to build and test workflows that
span media types with different catalogs, formats, providers, and acquisition
services. A separate release line lets us validate those ideas with users
without making upstream Seerr responsible for our experimental scope or
development pace.

The fork is a place to develop useful capabilities, learn from their operation,
and offer changes upstream when they fit. It is not a claim that Seerr should
adopt every feature or follow SeerrNG's full product direction. Seerr remains
the foundation for inherited movie and television requests, users, media-server
behavior, and deployment patterns. We continue to preserve its attribution and
the licenses of upstream and third-party work; see the [NOTICE.md policy](https://github.com/snapetech-org/seerrng/blob/main/NOTICE.md).

## What SeerrNG Carries

SeerrNG brings discovery, requests, approvals, availability, and status into a
single interface across movies and television, music, ebooks and audiobooks,
comics, magazines, emulation ROMs, and PC games. It connects those workflows to
catalogs and specialized services while keeping request ownership, permissions,
notifications, and status visible in one place.

The maturity of each category varies. Some workflows are established; others
continue to evolve as catalogs, metadata, providers, and real-world library
behavior are tested. The [repository README](https://github.com/snapetech-org/seerrng#documentation)
and guides linked from this documentation describe current operator-facing behavior.

## Companion Services and SeerrNG-Specific Changes

BookshelfNG, ChaptarrNG, QuestarrNG, and ROMarrNG are separately deployed
applications, not code bundled into SeerrNG or direct npm dependencies. SeerrNG
connects to them through provider APIs. The fork-specific work is primarily at
that integration boundary: each side needs to preserve the identity, choices,
permissions, and lifecycle of a request as it moves from SeerrNG into an
acquisition service and back.

| Area | SeerrNG-specific integration work | Why it is needed |
| --- | --- | --- |
| Books and audiobooks | Capability discovery; format-scoped routes and status; durable provider identity; paged library reads; pending-import progress, retry, and cancellation; and restricted service credentials. | A single book may be requested as an ebook, audiobook, or both. The integration must keep the selected format and provider record attached to the request and avoid granting an integration broad administrative access. |
| PC games | A versioned provider contract that carries the request ID, exact IGDB identity, and selected operating system and architecture through acquisition, status, retry, cancellation, and authenticated request-scoped file delivery. | A game title alone does not identify the selected PC build or the request that owns its download. SeerrNG needs status recovery and safe delivery for the right requester. |
| Emulation ROMs | Stable catalog identities, caller-owned request IDs, per-request status and actions, library lookup, restricted access, and bounded, path-checked file delivery. | A generic name-and-platform request does not preserve catalog identity, make retries idempotent, or provide the request-level controls and file boundaries SeerrNG needs. |
| Music, comics, and magazines | Integrations with existing catalogs and automation services, with category-specific discovery and service routing in SeerrNG. | These categories need distinct metadata and provider behavior; they do not all require a new SeerrNG companion fork. |

These contracts also rely on security properties such as scoped credentials,
validated external targets, authorization at the request boundary, and safe
file access. The exact capabilities, upstream comparisons, and replacement
criteria for the four maintained companion forks are tracked in [Maintained
dependency forks](./using-seerr/dependency-forks.md). Those comparisons are
point-in-time records and should be checked against the linked upstream
releases before changing a dependency.

## Working With Upstream Projects

Upstream projects may take SeerrNG work in whole, in part, or in spirit. We can
contribute a complete implementation, a smaller reusable component, tests and
documentation, or a description of the underlying idea. We will preserve
authorship, provenance, existing license notices, and each project's
contribution requirements, and we will adapt a proposal to the receiving
project's design and review process.

We have not yet had many upstream conversations. Development has moved quickly,
and we have been uncertain how best to present the breadth of the changes and
their origins across several related projects. We are making the rationale and
integration boundaries clearer now, and welcome conversations with Seerr or
companion-project maintainers. Questions, design feedback, and concerns about
compatibility, scope, security, attribution, or provenance are welcome through
[SeerrNG Discussions](https://github.com/snapetech-org/seerrng/discussions) or
[SeerrNG Issues](https://github.com/snapetech-org/seerrng/issues). Each upstream
project decides what it wants to accept and on what terms.

## What Could Let SeerrNG Stop Being a Required Fork

The fork could stop being necessary when a supported upstream Seerr release,
maintained extension, or equivalent adapter provides the behavior SeerrNG and
its users rely on. The source of that behavior can be upstream code, a partial
contribution, a plugin boundary, or a compatible external service. The
important test is equivalent behavior in a supported release, not whether the
same patches appear in upstream.

Before retiring the fork, the replacement path would need to:

1. Cover the media categories and workflows users still rely on, or provide a
   supported extension point that supplies them without a divergent core fork.
2. Preserve stable catalog and provider identity, selected format or platform,
   request ownership, status history, retry and cancellation behavior, and
   recovery after provider or application restarts.
3. Keep equivalent permission and security boundaries, including scoped
   integration credentials, validated external requests, authorized file
   delivery, and safe path handling.
4. Provide a tested data and API transition for requests, user preferences,
   permissions, provider links, and other persisted state that operators need
   to retain.
5. Pass SeerrNG's compatibility checks against an exact supported release,
   with documented upgrade, rollback, and support guidance for operators.
6. Account for remaining fork-owned operational needs such as packaging,
   releases, setup instructions, and maintenance of any companion integrations.

An upstream feature branch or an unmerged proposal would not be enough. The
replacement must be released, maintained, secured, and usable by existing
SeerrNG deployments. Retiring the SeerrNG core fork would also not require
retiring every companion fork: each has its own standalone users and its own
replacement criteria in the [dependency-fork guide](./using-seerr/dependency-forks.md).

## Review Status

This page records the project's intent and current integration shape. Feature
and dependency details change as SeerrNG and upstream projects develop; update
the linked guides when contracts or supported releases change. Confidence is
high for the intent and repository-documented behaviors summarized here, and
unknown for the decisions or timelines of upstream maintainers.
