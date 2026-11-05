---
category: changed
audience: operators
area: networking
action: none
breaking: false
---
Remote services now receive a versioned Seerr User-Agent on SeerrNG server-side Axios requests, including image requests. Provider-specific identifiers remain unchanged. Operators can identify the client and software version; the header contains no user or request identity. See Seerr PR #3395.
