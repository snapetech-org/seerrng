Lumen verifies Watchlist removals against a fresh title response before showing
success. If the removal may have been accepted but confirmation is unavailable,
it keeps the prior control state and asks the user to retry after checking the
current state. A later fresh read detects an already completed removal without
sending a duplicate delete.
