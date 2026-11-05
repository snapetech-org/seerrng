---
category: fixed
audience: users
area: requests
action: Keep incomplete media links and temporary provider errors from breaking request tracking
breaking: false
---
Recover request reconciliation guards for missing media links and bound error-cause traversal during provider retries. Cyclic errors cannot stall dispatch handling. Regression coverage also verifies prompt missing-service failures, transactional completion, reporter notification settings and preservation of history when provider media is removed.
