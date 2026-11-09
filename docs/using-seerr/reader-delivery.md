---
title: Deliver ebooks, audiobooks, comics, and magazines to reader apps
description: Set up Grimmory or BookOrbit for reader catalogs and deliver requested media to compatible devices.
sidebar_position: 26
---

# Deliver books and issues to reader apps

SeerrNG connects your existing media libraries to compatible readers through
Grimmory or BookOrbit. Grimmory is recommended and stays the preferred service
by default. You can configure either service or both.

Reader Apps are for browsing and reading files that are already in a library.
They do not search acquisition sources or process SeerrNG requests. BookOrbit's
own request queue is separate and is not connected to SeerrNG. Use a configured
book service under **Settings > Services** for ebook or audiobook
acquisition; SeerrNG sends approved requests there and tracks their progress.

SeerrNG does not copy files into Grimmory or BookOrbit. The reader service must
index the files it will show in its catalogs and players. SeerrNG also offers
protected downloads for available files attached to your own requests, so you
can save them directly to the device running this browser.

## What works with each service

| Media | Grimmory | BookOrbit |
| --- | --- | --- |
| Ebooks | OPDS catalog and Grimmory readers | OPDS catalog |
| Audiobooks | Grimmory library player for M4B, M4A, and MP3; SeerrNG can also download available requested files | BookOrbit web player for M4B, MP3, M4A, OPUS, OGG, and FLAC; audio is not available through OPDS; SeerrNG can also download available requested files |
| Comics | Komga API for comic apps that stream pages; SeerrNG can download available requested files | Built-in reader for CBZ, CBR, and CB7; OPDS can download CBZ and CBR; SeerrNG can also download available requested files |
| Magazine issues | Import PDF issues in the library to browse them through OPDS; SeerrNG can download available requested issues | Import PDF issues in the library to browse them through OPDS; SeerrNG can download available requested issues |

OPDS gives reader apps a catalog for browsing and downloading supported files.
BookOrbit's built-in web readers handle its audiobook and comic formats, while
third-party OPDS apps cannot stream audiobooks and can download only supported
comic archives. Grimmory's Komga API is the better path for comic apps that
stream one page at a time. Magazine issues do not have a separate magazine
catalog in these integrations; the reader service must index them as PDF files.
Reader support still depends on the device app and the file format.

## 1. Make the files visible to your reader service

Import or mount the relevant media folders into Grimmory or BookOrbit and run
that service's library scan. If you use containers, use the path as it appears
inside the reader service. The files can live in the same shared storage even
when their container paths differ.

For example, if a host directory is mounted at /books in Bookshelf and at
/library in Grimmory, configure Grimmory to scan /library. Keep the library
manager's paths stable. Do not enable reader-service options that move or
rename files unless you also update the manager's paths.

Create OPDS reader accounts in Grimmory or BookOrbit and enter those
credentials in the reading app. To let SeerrNG manage live reader shelves,
also configure a reader-service administrator account in SeerrNG. These are
separate credentials: SeerrNG needs the service account to create a grouping;
reader apps still use their OPDS credentials.

See the [Grimmory OPDS guide](https://grimmory.org/docs/integration/opds/),
[Grimmory Komga API guide](https://grimmory.org/docs/integration/komga-api/),
and [BookOrbit OPDS guide](https://bookorbit.app/opds) for their setup steps.

## 2. Configure Reader Apps in SeerrNG

Open **Settings > Services > Reader Apps**.

1. Enter an address the reading device can reach. Include any reverse-proxy
   base path. You can paste either the service address or its full OPDS address.
2. Configure Grimmory, BookOrbit, or both. Choose a preferred service. If it
   has no address, SeerrNG uses the other configured service.
3. Save the settings. Copy the generated OPDS address into an ebook app. For
   Grimmory, copy the separate Komga address into a compatible comic app.

Use a LAN hostname or public reverse-proxy address when the reader is on
another device. localhost and Docker-only service names generally refer to the
reading device itself. The device must resolve the host and trust its HTTPS
certificate.

For SeerrNG-managed shelves, enter the reader-service administrator username
and password for each configured service, then save and use **Test grouping
access**. SeerrNG stores the password in its private settings file and
redacts it from settings API responses. Clear **Remove saved account
credentials** and save to remove it. The saved account is used for shelf
management; it is not the OPDS account used by readers.

The Grimmory Komga API must be enabled under its OPDS settings before a comic
app can use that address. Grimmory's OPDS and Komga APIs share reader
credentials. The SeerrNG link opens the configured Grimmory endpoint; enter its
address and credentials in a Komga-compatible reader app.

## Create a live reader shelf from SeerrNG

Administrators can create a live, rule-based shelf from an author, book-series,
or comic-series page. Open **Create reader shelf**, choose Grimmory or
BookOrbit, and preview the current matches and sample titles before saving. The
rule is managed by the reader service, so future matching books appear when
that service refreshes its library. SeerrNG does not copy, move, or delete
library files when it creates a shelf.

Keep **Show this grouping to other reader-service users** on when your reader
or OPDS account belongs to a different reader-service user than the account
connected in SeerrNG. The reader account also needs access to the matching
library. BookOrbit public scopes appear in OPDS feeds; private scopes are only
visible to their owner. BookOrbit locks a scope's visibility when it is
created, so SeerrNG cannot change that choice later. BookOrbit SmartScopes
remain live as the library changes, but BookOrbit does not sync SmartScopes to
Kobo. When **Sync this live rule to Kobo** is enabled, SeerrNG creates a
companion regular BookOrbit Collection, enables BookOrbit's native Kobo sync,
and reconciles that Collection's membership with the SmartScope matches every
15 minutes by default. BookOrbit must have a Kobo account paired. The refresh
schedule can be adjusted under **Settings > Jobs**. The managed Collection is
reserved for SeerrNG; manual membership changes are replaced on the next
refresh. Turning Kobo sync off leaves the Collection in BookOrbit but disables
its Kobo sync. Grimmory's separate Kobo inclusion shelf is left unchanged.
SeerrNG reports the SmartScope and Kobo Collection statuses independently. If
there are no current matches, you must explicitly allow an empty rule before
saving so books added later can appear.

Remove a SeerrNG-managed shelf under **Settings > Services > Reader Apps**.
For BookOrbit, this also removes its SeerrNG-managed companion Kobo Collection.
This does not delete books or library files.

## 3. Download or browse from a media page

Open a book, comic, or magazine in SeerrNG.

- **Browse ebooks** opens the selected reader service in a browser so you can
  search its library. To use an e-reader app, copy the OPDS address under
  **Settings > Services > Reader Apps**, add it in that app, and sign in with
  the reader-service credentials.
- **Open audiobook library** opens the selected reader service. Find the
  audiobook in that service's library and use its player. BookOrbit supports
  M4B, MP3, M4A, OPUS, OGG, and FLAC in its web player; these files are not
  delivered through OPDS.
- **Browse comics** opens the selected reader service. BookOrbit's web library
  reads CBZ, CBR, and CB7. For page streaming in a separate comic app, copy
  Grimmory's Komga address under **Settings > Services > Reader Apps**.
  BookOrbit OPDS lists CBZ and CBR downloads.
- **Browse magazine PDFs** opens the preferred reader service. Import magazine
  issues as PDF files there first; OPDS does not preserve magazine-specific
  issue organization. Add the service's OPDS address to a reader app from
  **Settings > Services > Reader Apps**.
- **Download ebook, Download audiobook, Download comic, or Download issue**
  appears when the signed-in user has an available request with a file SeerrNG
  can resolve. If there are multiple files, choose the requested issue or
  format from the list. The downloaded copy is saved by this browser to the
  device running SeerrNG.

Direct downloads require the request to be available and accessible to the
signed-in user. For files served from the manager's storage, open
**Settings > General > Download Copies** and add a library path mapping for
each relevant service. Map the path reported by the manager to the read-only
path mounted inside SeerrNG. Use narrow roots so only the intended library is
available. Mylar3 and Issuarr comic issues are streamed through their API and
do not use a local path mapping.

If a download action is missing, open **Request Status** and confirm that the
request belongs to the signed-in user and is available. Check that the manager
reports a file and that its path maps to a regular file inside SeerrNG's
configured root. The endpoint verifies the file remains inside that root before
serving it. When a manager is temporarily unavailable, any copies SeerrNG
could still resolve remain available and the download action links to Request
Status to check other copies. A reader-service catalog is still useful for
browsing library items that were not requested through SeerrNG.

## What SeerrNG tracks

SeerrNG tracks requests, service availability, and the status/count of shelves
it manages. The reader service owns its library scan, audiobook playback,
reading progress, highlights, and annotations. OPDS or Komga links do not
confirm that a device has connected, that the service has indexed a file, or
that a device synchronized its progress. For service-side issues, check the
reader app's library scan and account permissions.

## Sources and attribution

This guide is maintained for SeerrNG by snapetech and SeerrNG contributors.
Inherited Seerr, Jellyseerr and Overseerr work retains its original credit; see
[NOTICE](https://github.com/snapetech-org/seerrng/blob/main/NOTICE.md) and the
[upstream source ledger](https://github.com/snapetech-org/seerrng/blob/main/UPSTREAM_ATTRIBUTION.md).

No feature-specific upstream issue or pull request is recorded for this guide
in the public source ledger. That absence does not establish original authorship.

[Back to the Seerr / SeerrNG feature comparison](../feature-comparison.md).
