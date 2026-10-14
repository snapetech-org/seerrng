---
title: Maintained dependency forks
description: Why SeerrNG maintains BookshelfNG, ChaptarrNG, QuestarrNG, and ROMarrNG, what they provide, and what would replace them.
sidebar_position: 7
---

# Why SeerrNG maintains four optional forks

**Reviewed:** 2026-10-14. Upstream state below is a point-in-time comparison; check
the linked branches and each fork's feature guide when updating a dependency.

BookshelfNG, ChaptarrNG, QuestarrNG, and ROMarrNG are optional services. Each
runs as a standalone application; SeerrNG does not bundle, install, or launch
them. They become dependencies only for the media categories and workflows an
operator enables.

For the broader reason SeerrNG itself remains a fork, how its changes may be
upstreamed, and what could replace the fork, see [Why SeerrNG is a fork](../fork-rationale.md).

## Why maintain forks

SeerrNG owns request discovery, approval, quotas, requester identity, and
notifications. Companion managers own indexer search, download handoff,
library import, and the provider's local records. To connect those separate
responsibilities safely, SeerrNG needs stable provider identity, explicit
capability negotiation, request-specific lifecycle/status, and controlled
access to any imported files. A generic title-add API does not necessarily
provide those guarantees.

We maintain forks where the required standalone behavior or SeerrNG contract
is not available in a supported upstream release. Forks let us version and
coordinate the provider contract while retaining each app's existing API and
standalone use. The goal is not to make a fork permanent: when an upstream
release supplies the needed behavior, SeerrNG can add and verify an adapter.

ChaptarrNG is the maintained book backend for new SeerrNG installs.
BookshelfNG remains a legacy connection for existing libraries while its data
and distribution channels are migrated. Both APIs remain readable by SeerrNG
during that transition; new requests should target ChaptarrNG.

## Forks and current upstream boundaries

### BookshelfNG

**Lineage:** [pennydreadful/bookshelf](https://github.com/pennydreadful/bookshelf),
a revival of [Readarr](https://github.com/Readarr/Readarr). The original
Readarr project was retired and its repository archived on 2025-06-27. The
current Bookshelf parent README says a book has one type per instance, so
ebooks and audiobooks require separate instances there.

**Standalone value:** BookshelfNG manages ebooks and audiobooks in one process
and database, can keep both formats on a book, and supports format-specific
paths and profile overrides. It retains the broader Readarr-style library
workflow while maintaining a native Hardcover provider, selectable runtime
catalogs, direct-download support, and current package/release channels. Many
automation basics are inherited from Bookshelf and Readarr; see its
[capability comparison](https://github.com/snapetech/bookshelfng/blob/main/docs/capabilities-and-compatibility.md)
for the current shared-versus-maintained inventory.

**With SeerrNG:** the `seerrng-bookshelf` capability contract advertises
format-scoped Readarr API routes and separate ebook/audiobook availability
counts. Both service entries can use the same BookshelfNG instance and
database. A restricted SeerrNG key limits access to supported request/search
operations without granting global administration.

**Replacement criteria:** a Bookshelf release would need to support both
formats on the same book and library, provide format-scoped operations and
availability data, and expose the restricted request/search access SeerrNG
uses. Any BookshelfNG standalone features still relied on, such as its
provider selection and direct-download workflows, must also be available or
replaced. Then SeerrNG must pass its Bookshelf compatibility checks against
that released version.

**BookshelfNG-to-ChaptarrNG transition:** ChaptarrNG contains a candidate
populated-database converter and preview/apply command in its standard
executable. It passed preview, explicit apply, and normal startup against
separate copies of one real populated migration-158 SQLite database. That
single database does not establish general real-user compatibility: 81 media
choices were test-only and not reviewed as correct classifications, and older
schemas, PostgreSQL, full settings/client behavior, rollback, and all-channel
validation remain open. The migration is not released. Keep independent
backups and do not point production installations at the candidate until the
gates in the [consolidation report](https://github.com/snapetech/bookshelfng/blob/main/docs/maintainers/chaptarr-consolidation.md)
pass. The BookshelfNG in-app updater still uses the Readarr update service;
channel-specific bridges are required.

### ChaptarrNG

**Lineage:** [Chaptarr/chaptarr](https://github.com/Chaptarr/chaptarr), an
independent Readarr-derived book manager. Chaptarr's current development tree
already has a pending-author-import subsystem and API. That engine is shared
product behavior and should not be described as exclusive to ChaptarrNG.

**Standalone value:** ChaptarrNG keeps Chaptarr's audiobook and ebook manager
and adds a built-in Direct Download indexer/client, authenticated encryption
for full backups, fork-owned release images and an Unraid template, and
maintained security/configuration work. General COPR, AUR, Chocolatey, Debian,
and Windows native packages are not currently published. Chaptarr also has its own encrypted
quick-start settings backup; the distinction here is full-backup encryption.
See the [ChaptarrNG feature and upstream guide](https://github.com/snapetech/chaptarrng/blob/main/docs/FORK_FEATURES.md).

**With SeerrNG:** ChaptarrNG advertises format routes, provider IDs, paged
library scans, pending-import operations, and its supported API dialect through
`GET /api/v1/system/capabilities`. It also accepts a restricted SeerrNG key.
This lets SeerrNG keep the selected format and provider identity through
search, request tracking, and asynchronous author preparation. The parent
Chaptarr API has no matching SeerrNG capability contract or scoped service key
in the reviewed source.

**Replacement criteria:** a supported Chaptarr release must preserve the full
ChaptarrNG product, not only the SeerrNG-facing API. That includes ChaptarrNG's
existing maintained features and active changes—such as capability discovery,
format/provider identity, paged library status, the restricted key, built-in
Direct Download, full-backup encryption, security behavior, and release/package
continuity—plus every BookshelfNG feature carried into the consolidated
ChaptarrNG product. Chaptarr already has a pending-import subsystem;
SeerrNG needs compatible exposed semantics, not a second queue implementation.
The [combined ChaptarrNG retirement matrix](https://github.com/snapetech/chaptarrng/blob/main/docs/FORK_FEATURES.md#chaptarrng-retirement-blockers)
tracks both sets. Every feature, sub-feature, post-fork source change, data
path, and distribution channel must be retained or replaced with a verified
equivalent, with tests, before ChaptarrNG can be retired into Chaptarr.
SeerrNG must then pass its compatibility checks against that exact supported
release.

### QuestarrNG

**Lineage:** [Doezer/Questarr](https://github.com/Doezer/Questarr), a standalone
game manager. At this review, the upstream `main` snapshot was
[`fb650bab`](https://github.com/Doezer/Questarr/commit/fb650bab63cb2f7ce3c9004ab9028cfc3b210a01).
This commit is the dated comparison point; later upstream and fork commits may
change the overlap.
The fork's own [change guide](https://github.com/snapetech/QuestarrNG/blob/main/docs/FORK_CHANGES.md)
tracks its release history and maintained features.

**Standalone value:** QuestarrNG remains a full PC-game manager. Fork-maintained
work includes platform-scoped library/discovery behavior, playing history,
acquisition and import safety, RomM and Playnite workflows, and additional
database, packaging, and Windows-service options. These features are reviewed
against upstream at each sync; do not treat all current QuestarrNG features as
permanently absent from Questarr.

**With SeerrNG:** request contract v2 carries the caller's durable request ID,
exact IGDB identity, and selected operating system/architecture through
acquisition. QuestarrNG reports lifecycle state and retry/cancel actions, uses
handoff checks to avoid duplicate transfers, and streams request-scoped files
or multi-file bundles through authenticated routes. The reviewed Questarr
`main` does not contain this SeerrNG provider contract.

**Replacement criteria:** Questarr would need a versioned provider contract
that preserves external request identity and selected PC variants; durable,
idempotent dispatch and status recovery; safe retry/cancel behavior around
download handoff; a scoped integration credential; and authenticated,
request-scoped single-file and bundle delivery. Upstream must also contain or
replace any standalone fork features SeerrNG continues to depend on. SeerrNG
must verify the exact released provider version before switching.

### ROMarrNG

**Lineage:** [BlizzHacker/romarr](https://github.com/BlizzHacker/romarr). The
maintained fork's last recorded merge from upstream was
[`06378a70`](https://github.com/BlizzHacker/romarr/commit/06378a70), on
2026-10-03. The compared upstream `main` release was v1.1.0, commit
[`31fefb0`](https://github.com/BlizzHacker/romarr/commit/31fefb0330e995c00350546d1470e6dcfa0fe117).

**Standalone value:** ROMarrNG runs the full ROM-arr acquisition application
without SeerrNG and publishes its own `romarrng` image, releases, and
installation instructions. The public ROMarr line already provides a generic
external-request intake and polling API, so its shared indexer, downloader,
and library features are not all NG-only. ROMarrNG maintains the extensions
and distribution it needs; its [upstream comparison](https://github.com/snapetech/ROMarrNG/blob/main/docs/UPSTREAM-PARITY.md)
records the current split.

**With SeerrNG:** the versioned contract adds a provider-only credential,
capability handshake, IGDB and DAT catalogs with stable identities,
idempotent caller-owned request IDs, per-request status/retry/cancel, library
lookup, and authenticated request-scoped asset streaming. The compared
upstream source accepts `{name, platform}` and generates its own request ID;
it exposes list/current polling, but not the catalog and per-request lifecycle
contract SeerrNG consumes.

**Replacement criteria:** an upstream ROMarr release would need a versioned
SeerrNG-compatible contract, a restricted integration credential, stable
IGDB/DAT catalog identities (or a SeerrNG adapter for equivalent catalogs),
idempotent external request IDs, per-request lifecycle/actions, bounded and
path-checked asset streaming, and the standalone fork behavior operators still
rely on. SeerrNG must test that released API before changing its provider.

## When a fork can be retired

A feature appearing in an upstream branch is not enough. A fork is no longer a
required SeerrNG dependency only after:

1. A supported upstream release contains the needed standalone behavior and
   the complete provider contract, or SeerrNG has a tested adapter for an
   equivalent upstream API.
2. The provider preserves identity, selected media/format/platform, lifecycle
   recovery, permissions, and safe file delivery required by current requests.
3. The exact release passes the SeerrNG consumer checks, and operators have a
   documented upgrade and data-compatibility path.

For Chaptarr specifically, that release gate includes the combined
ChaptarrNG-plus-ported-BookshelfNG feature set, not just the SeerrNG API
contract. The BookshelfNG consolidation and the later ChaptarrNG upstream
retirement are separate transitions, each requiring its own populated-data and
distribution proof. Active ChaptarrNG branches and open feature PRs count
before release too; the combined matrix tracks the current backlog features,
integrations, localization, proposed channel changes, and the individual
retirement checks. The earlier backlog snapshot `24b340f` is historical; PRs
#69–#77 have since merged. At this review, ChaptarrNG `origin/main` is
`4364742e`, 575 commits ahead and zero behind Chaptarr `upstream/develop` at
`e67374f4`, across 1,100 changed paths (342 added and 758 modified). Open
product and maintenance work includes PRs #78, #97, #100, and #101; all open
dependency updates also remain in scope. ChaptarrNG PR #100 carries the
BookshelfNG migration, BookLore integration, native packaging, and guarded
legacy-channel bridge candidates. Its migration-158 SQL test fixture was
hidden by a generic ignore rule; the tracked fixture and a targeted ignore
exception are now on the PR branch, the 12 focused importer tests pass locally,
and fresh hosted checks are pending. BookshelfNG PRs #128 and #130 and SeerrNG
PR #280 remain open, so none of the BookshelfNG package or backend changes is
released. Each feature or channel change remains in the upstream retirement
review before merge or release.

Keep any fork that still supplies standalone functionality operators rely on,
even if its SeerrNG contract has been upstreamed. Recheck parent branches before
each upstream sync, update the comparison above with the commit inspected, and
revise the matching fork's README and feature guide whenever its behavior
changes. This page covers only BookshelfNG, ChaptarrNG, QuestarrNG, and ROMarrNG;
it does not cover TorrentNG or IPTVtunerr.
