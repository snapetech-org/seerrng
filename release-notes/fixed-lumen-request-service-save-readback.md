Lumen now verifies saved Soulseek and ReadMeABook connection settings against the
successful PUT response and a fresh settings readback before reporting success.
A stale readback keeps edits and saved API-key removal intent retryable without
exposing credentials.
