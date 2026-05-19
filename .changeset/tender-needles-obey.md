---
"better-auth": patch
---

Fix broken docs link for the `email_doesn't_match` error by renaming the error code to `email_mismatch`. The apostrophe in the old code was URL-encoded as `%27`, producing a broken link in the error page. Consumers relying on the old error code string should update to `email_mismatch`.
