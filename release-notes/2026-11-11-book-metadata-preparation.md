# Keep book metadata preparation pending

Book services can report that a work's complete metadata is still being prepared even after search finds it. Explicit metadata-pending responses now retain the approved request in the durable dispatch queue, honor bounded retry delays across restarts, and avoid false failure notifications. A 24-hour preparation deadline bounds retries; real missing-work and service failures remain separate.
