---
category: fixed
audience: users, operators
area: search
action: none
breaking: false
---

TMDB-backed search now retries an unmatched query after normalizing apostrophes,
diacritics, punctuation, and whitespace. Queries that already return results
keep their original terms and ordering.
