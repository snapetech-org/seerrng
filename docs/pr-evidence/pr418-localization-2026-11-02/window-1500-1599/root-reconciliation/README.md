# SeerrNG PR #418 W1500–1599 proposed root reconciliation

Exact live PR pin: 94bdd3f690fc54d37d17e04d29a443533af3fb0d / 17df3c6f626ac544990d2f8f2049daf95b4738ac (OPEN/DRAFT at the initial and final checks).

This ledger has one row per source/current cell across all 12 locales. It joins the primary packet, locale-A cross-review, and independent locale-B cross-review, retaining exact source/current/catalog/candidate hashes, reviewer dispositions and targets, caller pins, and structural checks. All packet checksum manifests were verified. The 1,200 live source/current cells, catalog blobs, primary candidates, reviewer targets, and caller line/file pins were re-attested at the pinned tree.

Suggested parent action: accept current values or primary candidates only where the applicable cross-review agrees on the exact choice; mark reviewer disagreements and unsupported caller use as hold. The 38 frozen Spanish prior dispositions are embedded with their exact previous final targets and root decisions and are not reopened. Two of those frozen cells have only definition-level caller evidence at this head; their prior records remain intact, while new action is held.

No repository, PR, or catalog changes; no tests, builds, scans, CI, workflow changes, releases, or browser review. Machine-assisted review is not native-speaker approval.
