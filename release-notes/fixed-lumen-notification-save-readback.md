Lumen now verifies notification settings against the successful save response and
fresh persisted settings before clearing drafts or reporting success. The checks
preserve write-only credential handling, webhook header redaction, and the local
JSON payload editor.
