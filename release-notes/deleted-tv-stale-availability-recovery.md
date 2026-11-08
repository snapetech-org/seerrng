### Deleted TV files: recover and request again

Administrators can use **Manage Series → Clear Stale HD/4K Availability** when a
fresh Sonarr check confirms no episode files remain, including when the series
tracking entry still exists. The control now works when viewer-scoped availability
is hidden. Confirming clears stale SeerrNG availability so an ordinary user can
submit a new request; existing provider entries, files and request history remain.
Unknown or failed provider checks and files appearing before confirmation block
recovery. This fixes the remaining workflow in reopened issue #199.
