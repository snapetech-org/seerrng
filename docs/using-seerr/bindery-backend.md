---
title: Bindery Backend
description: Connect Bindery to send approved ebook and audiobook requests and scan library availability.
sidebar_position: 22
---

# Bindery Backend

Bindery is an optional book acquisition service for ebooks and audiobooks. Add
it from **Settings → Services → Audiobooks & Books → Add Bindery Server**. Use
the host, port, URL base, SSL setting, and API key for your Bindery instance.
The default Bindery port is `8787`; leave URL Base blank unless Bindery is
served under a path. Keep the API key in the SeerrNG service form.

Choose **Ebook**, **Audiobook**, or **Ebooks and audiobooks**. A connection set
to both formats can be the default for both, so an approved request for both
formats is sent to Bindery once with `mediaType: both`. If you use separate
Bindery instances for the formats, add one service entry for each and mark one
default for each format. Enable **Scan library availability** to include
Bindery's imported books in SeerrNG's availability checks.

## Request handling

SeerrNG keeps discovery and book metadata in its configured book catalog. On
approval, it resolves the title to the identifier expected by Bindery's
configured primary metadata provider, then asks Bindery to add and search for
the requested format. Bindery handles indexer search, downloads, imports, and
its own acquisition settings. SeerrNG records the service destination and
request state, and scans Bindery's imported ebook and audiobook records to
update availability. Bindery's API uses `X-Api-Key` authentication and exposes
separate endpoints for adding books, looking up metadata, and listing imported
library records; see the [Bindery API reference](https://github.com/vavallee/bindery/blob/main/docs/API.md).

For metadata matching, provide a supported identifier in the SeerrNG book
record when available: a provider ID for Bindery's primary provider or an ISBN.
When neither exists, SeerrNG can use Bindery's book search and accepts only an
exact title match with a matching author when available. If it cannot identify
the same book safely, the request fails with a diagnostic error instead of
adding a different title.

SeerrNG does not send Readarr or Bookshelf profiles, root folders, tags, or
edition choices to Bindery. Configure acquisition defaults inside Bindery. An
edition selected in SeerrNG helps identify the requested book, but Bindery's
request API accepts the provider book identity and requested media format
rather than a specific edition.

For a release-search or download problem, use SeerrNG's request status first,
then have an administrator check Bindery's request, queue, and logs. SeerrNG
does not relay raw backend error text because it can include private filesystem
paths or service details. If you place files in the library yourself, use
Bindery's import tools; SeerrNG will recognize the book on its next library
availability scan.

## Request ownership

Current Bindery releases may not advertise support for requester-owned
requests. In that case, SeerrNG adds the approved book using the configured API
key, so Bindery records the service account as the owner. The connection test
shows which behavior the connected version supports.

If Bindery advertises the `requestsForUser` capability in `/system/status`,
SeerrNG creates a Bindery request for the matching user. During setup, **Test
connection** reports whether that capability is available and how many user
accounts Bindery returned. An administrator must set **Requester Account
Mappings** in that Bindery service's connection dialog. Enter a JSON object
whose keys are SeerrNG user IDs and whose values are Bindery user IDs; for
example, `{"2": 7}` assigns requests from SeerrNG user 2 to Bindery account 7.
Use the user's SeerrNG profile URL to identify the SeerrNG ID and Bindery's
administrator user records to identify the Bindery ID. Configure each Bindery
service separately.

Display names and email addresses are not proof of account ownership and are
never used for this association. Missing mappings or a mapped Bindery account
that no longer exists stop dispatch with an administrator-action message.
SeerrNG does not fall back to the API-key owner when requester-owned requests
are advertised. Existing connections need this explicit mapping before sending
new requester-owned requests; earlier name-based associations are not migrated
because they were not verified identity links.

Enable Bindery's **Auto-approve requests** option for each account whose
SeerrNG-approved requests should start acquisition immediately. Without it,
the requester sees that their book is waiting for Bindery approval, and
SeerrNG will begin tracking acquisition after Bindery approves it. See
Bindery's [multi-user guide](https://github.com/vavallee/bindery/blob/main/docs/multi-user.md).

Bindery request ownership is separate from library privacy. Bindery scopes
accounts to their own books and downloads only when
`BINDERY_ENFORCE_TENANCY=true` is set in Bindery's environment; without it,
accounts can see shared instance data. SeerrNG does not change this Bindery
setting.

## Availability and request lifecycle

SeerrNG syncs the linked Bindery request's pending, approved, and declined
state. After approval, it reads Bindery's acquisition queue to show when the
book is downloading or importing. It also scans imported records separately
for ebooks and audiobooks, then matches provider IDs and ISBNs to SeerrNG's
book records. Library and queue reads are read-only: SeerrNG does not start,
pause, or remove Bindery downloads.

If a requester cancels while their Bindery request is still pending, SeerrNG
withdraws it in Bindery and clears the local service link. If Bindery has
already approved it, SeerrNG leaves the acquisition running. Bindery offers
admin queue-removal tools, but SeerrNG does not turn request deletion into a
service-wide queue deletion that could interrupt work Bindery or another
request still needs. The full Bindery queue is not exposed as a separate
SeerrNG management screen; SeerrNG shows progress for requests created through
SeerrNG. An administrator can still manage a download directly in Bindery.

When using an older Bindery version without per-user requests, SeerrNG adds the
approved book directly and Bindery does not create a request record to
withdraw. That acquisition can continue after the SeerrNG request is canceled.

Bindery's API also exposes administration, file, OPDS, backup, and
metadata-management features. SeerrNG uses the operations needed to test the
connection, resolve and submit approved books, map requester accounts when
the server advertises that capability, reconcile linked request states, read
download progress, and scan library availability. It does not manage Bindery
users, files, configuration, or downloads.
