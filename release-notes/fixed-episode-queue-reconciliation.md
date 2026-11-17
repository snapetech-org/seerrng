---
category: fixed
audience: users, operators
area: requests
action: none
breaking: false
---
Episode Queue fills the selected buffer after the starting episode imports, reconciles saved watched state even without active playback, and checks refill eligibility every minute. Manually marking an episode watched in Plex now advances the queue, including when the active-session endpoint is unavailable. Long-running series load episode metadata in smaller batches while retaining their starting selection.
