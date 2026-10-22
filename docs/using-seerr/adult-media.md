---
title: Adult media
description: Configure Whisparr to discover, request, and track adult scenes.
sidebar_position: 26
---

# Adult media

SeerrNG has a dedicated **Adult** category backed by Whisparr. It uses
Whisparr's scene-focused catalog and StashDB scene IDs, with its own request
permission, approval option, quota, and Request Status filter. Adult scenes do
not enter the ordinary movie or TV catalogs, TMDB search, or watchlists.

## Connect Whisparr

Use the scene-focused [Whisparr Eros v3
branch](https://github.com/Whisparr/Whisparr-Eros). SeerrNG does not support the
studio-focused Whisparr v2 API.

1. Configure indexers, download clients, and acquisition behavior in Whisparr.
   Whisparr owns scene searching, grabbing, downloading, and importing.
2. In SeerrNG, open **Settings → Services → TV & Movies → Whisparr Settings**
   and select **Connect Whisparr Server**. Enter the hostname and port reachable
   from SeerrNG, API key, and optional URL base.
3. Select **Test**. SeerrNG checks the scene API and loads Whisparr quality
   profiles and root folders.
4. Choose the profile and root folder for new scenes. Mark one connection as
   the default, then connect it.
5. Enable **Library Scan** to sync existing scenes and their availability.
   The scan runs on the Whisparr Adult Scene Scan schedule. Without it, scenes
   already in Whisparr may not be recognized until a request reaches that
   service.
6. Enable **Search on Approval** if Whisparr should search immediately after
   an adult request is approved or auto-approved.

If SeerrNG cannot reach Whisparr during setup, check the address from the
SeerrNG server or container, API key, SSL setting, URL base, and firewall rules.
The API key is masked after saving.

## Enable the category and grant access

An administrator opens **Settings → Media Categories**, enables **Adult**, and
grants **Request Adult** to the users who may browse and request scenes. Adult
is disabled by default and is hidden until Whisparr is configured. Adult access
is checked separately from the general Request permission.

Administrators can grant **Auto Approve Adult Requests** for users who should
skip the approval queue. **Manage Requests** also auto-approves Adult requests.
Otherwise, a request waits for approval before SeerrNG sends it to Whisparr.

Set the global Adult request limit in **Settings → Users**. An administrator
can set a different Adult quota for an individual user. The quota counts
requests submitted during the configured time window.

## Browse and request scenes

Users with Adult access open **Discover → Adult** to browse recently added
scenes from their Whisparr libraries or search across configured Whisparr
servers by title, performer, or studio. Results include scene artwork, studio,
performers, library state, and the server that supplied the result. Opening a
scene shows its details and links performers and studios back to related Adult
searches. With multiple Whisparr instances, the server filter can focus on one
library or search all configured servers. The scene page links back to the same
search and server scope. SeerrNG checks the StashDB identity against library and
request state before accepting another request. Request Status shows Adult
requests alongside the other request types and has a dedicated Adult media
filter.

Users with advanced request options can choose which Whisparr server receives a
request. The chosen server is carried from a catalog result through scene
details and the request dialog. Availability and in-progress state are checked
for that destination, so scenes already present there cannot be requested again.
Users without advanced options request through the configured default server.

Approved requests use the configured Whisparr default, quality profile, and
root folder. Whisparr handles the download and import lifecycle; SeerrNG reads
its queue and library scan to show request progress and availability.

SeerrNG's **Indexer Search** can also send a manual Adult search to Prowlarr
using the configured **XXX** category (Newznab/Torznab category `6000`). This is
for an explicit, manual search. If enabled for the user, **Send to downloader**
hands the chosen result to Prowlarr's configured download client. It does not
create an Adult request or change request status. Approved requests still go
through Whisparr.

## Troubleshooting

- If **Adult** is missing, configure Whisparr, enable the category in **Settings
  → Media Categories**, and grant **Request Adult** (or **Manage Requests** to
  view and moderate Adult requests).
- If connection testing fails, verify that the configured Whisparr instance
  exposes the scene API v3 endpoint. Whisparr v2 is not compatible.
- If an existing scene is not marked available, enable **Library Scan** and
  wait for the next Whisparr Adult Scene Scan. Confirm that the scene has a
  StashDB ID in Whisparr.
- If approval succeeds but no release is found, check Whisparr's indexer
  categories, download client, and scene metadata. SeerrNG's manual Prowlarr
  search categories do not change Whisparr's own indexer configuration.

## Current boundaries

- Adult catalog and detail lookups come from the configured Whisparr scene API.
  SeerrNG does not connect directly to Stash or another scene manager. Scene
  artwork is loaded through an authenticated, size-bounded SeerrNG image route.
- Whisparr controls approved-request acquisition, monitoring, and import
  behavior. A manual Prowlarr handoff uses Prowlarr's configured downloader and
  stays separate from Whisparr-managed requests.
- The supported integration is Whisparr's scene-focused v3 API; Whisparr v2 is
  not supported.
