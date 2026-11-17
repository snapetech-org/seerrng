---
category: fixed
audience: users, operators
area: localization
action: none
breaking: false
---
Locale catalogs no longer supply empty, invalid ICU, or incompatible-placeholder translations to the interface. Missing values use the existing locale/English fallback path. Retired and invalid nonempty entries are retained in a review archive; translation review status is unchanged.
