---
category: fixed
audience: users
area: lumen
action: Open movies and series in the Android Plex app at the selected title
breaking: false
---
Recover @ncbudd's Android routing correction: movies use Plex's playback route and series use its library route instead of the iOS preplay route. Package-bound intents retain the browser fallback, and decoded server/key delimiters are rejected before native route construction.
