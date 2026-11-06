# Android system navigation and playback handoff

Android handles Back through the current system API, keeps controls inside system
insets, follows device dark mode and restores the selected server after activity
recreation. Tapped Plex links can open the native app. Intent handoff constructs
a fresh browsable view intent: page-supplied actions, components, extras and URI
grants are discarded, and local or executable URL schemes are rejected.
