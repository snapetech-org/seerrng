---
title: Add your requester tag to available media
description: Add your own Radarr or Sonarr requester tag to media that is already available.
---

# Add your requester tag to available media

If Radarr or Sonarr already has a movie or series, SeerrNG can submit a request
to add your requester tag to that existing item. This helps you mark media you
plan to watch without asking the service to acquire another copy.

This action is available only when **Requester Tags** is enabled for the
selected Radarr or Sonarr server. See [Configure Radarr and Sonarr](./settings/services.md#radarrsonarr-settings)
and [choose a request destination](./settings/services.md#request-destination-label-optional)
for service and access setup.

## Submit a tag request

1. Open a movie or series detail page that shows the item as available on a
   configured Radarr or Sonarr destination.
2. Choose **Add Your Tag** for the available format and destination.
3. Submit the request. If your request needs review, a manager must approve it
   before SeerrNG updates the service.

The action uses your normal movie or TV request permission and quota. A
non-default destination also requires access to that service. If your quota
requires approval, the request follows the existing manager approval flow.

For TV, the action applies to the full series. SeerrNG offers it only when the
selected Sonarr destination confirms every regular season as available;
partial-season and episode-only tag requests are not supported. You can still
use the usual request flow for missing seasons or episodes.

## What happens after approval

SeerrNG checks the selected destination and confirms that it still contains
the matching item. It then adds your requester tag to that item and confirms
the tag is present. The update does not start an acquisition or change the
service's quality profile, folder, monitoring, or search settings. If SeerrNG
cannot confirm the item or complete the tag update, the request fails with no
acquisition fallback.

The **Requester Tags** service setting also adds requester tags to new movie
and series requests sent to Radarr or Sonarr. Enabling it therefore supports
both ordinary acquisitions and tag requests for items that are already in the
library.

This behavior adapts the idea in [Seerr PR #3423](https://github.com/seerr-team/seerr/pull/3423)
to SeerrNG's per-service destinations and request approval model.
