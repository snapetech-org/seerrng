---
category: fixed
audience: operators
area: packaging
action: none
breaking: false
---
Make the reviewed localization surface inventory independent of filesystem enumeration order so Windows release builds validate the same source inventory as Linux and macOS. Container builds now include the exact checked-in localization JSON files while continuing to exclude operator configuration.
