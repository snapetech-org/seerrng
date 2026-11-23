Lumen now confirms a scheduled job's cron value through a fresh settings read
before it closes the schedule editor. If SeerrNG accepts a save but the
persisted schedule cannot be confirmed, Lumen keeps the edited value visible,
shows a retryable error, and lets the administrator save again. Confirmation
and success feedback are localized in English, French, and Arabic.
