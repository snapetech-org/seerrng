---
category: added
audience: users, operators
area: requests
action: none
breaking: false
---

Radarr and Sonarr override rules can match movies and series by TMDB production
country. Selected countries are alternatives within that condition; other
configured rule conditions must also match. Titles without production-country
metadata do not match a country condition. Sonarr services that expose
language profiles can select one in the rule, while explicit requester choices
remain in effect. This adapts the use case discussed in Seerr
[issue #3439](https://github.com/seerr-team/seerr/issues/3439).
