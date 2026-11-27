The shared Follow control now verifies membership against the current Following
list before updating its label. If a write response is lost or the confirmation
read fails, Lumen preserves the previous state and reports that the change could
not be confirmed. The next click refreshes membership only and updates the
control if the server already applied the change, without repeating the action.
