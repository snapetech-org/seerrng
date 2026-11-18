---
category: security
audience: users
area: lumen
action: none
breaking: false
---

Lumen validates artwork URLs on shared cover cards and uses the drawn cover when a request's artwork URL is unsupported.

Same-origin artwork is limited to the image proxy and dedicated cover
endpoints. Other same-origin paths use the artwork fallback.

Artwork on shared cards and the affected detail screens loads without sending the page address as a referrer.
