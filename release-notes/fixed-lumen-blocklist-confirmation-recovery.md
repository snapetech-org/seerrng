Lumen keeps Blocklist add and remove confirmations open when the server has
not applied the change, allowing a safe retry. It checks persisted state after
an uncertain response so an already-applied change is not repeated.
