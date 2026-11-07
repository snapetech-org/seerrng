---
category: fixed
audience: operators
area: releases
action: none
breaking: false
---

Main CI validates every unpublished release-note fragment with the same assembler used for publication. Merged contributions with malformed notes now fail before tagging, rather than passing a check limited to the latest commit.
