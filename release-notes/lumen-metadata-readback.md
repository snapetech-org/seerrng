When a metadata settings write is acknowledged but the follow-up readback fails,
Lumen now reports that the saved state could not be confirmed. The draft remains
available for retry, and rejected writes continue to report save errors.
