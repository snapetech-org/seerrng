Lumen keeps Blocklist add and remove confirmations open when the server has
not applied the change, allowing a safe retry. It checks persisted state after
an uncertain response so an already-applied change is not repeated. The same
recovery now covers removals from the Blocklist management list.
Bulk movie-collection Blocklist actions also keep confirmation available when
the change remains unconfirmed and read the collection back before closing
after an uncertain response.
