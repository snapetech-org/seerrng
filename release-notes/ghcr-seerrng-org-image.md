---
category: changed
audience: operators
area: distribution
action: Change the image reference to ghcr.io/snapetech-org/seerrng in your compose file, Unraid template, or Helm values, then pull the image again and recreate the service.
breaking: true
---
The SeerrNG container image and Helm chart are now published as ghcr.io/snapetech-org/seerrng. New releases are no longer pushed to ghcr.io/snapetech/seerrng, so existing installs must switch to the new path to receive updates.
