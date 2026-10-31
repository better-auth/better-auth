---
"@better-auth/core": minor
---

The GitHub provider now uses the account's verified primary email when it differs from the public profile email. Previously, users who show a different address on their GitHub profile signed in with that public address. The public email is still used when the primary email is unverified or the email list can't be read. Apps that link accounts by email, or that set `overrideUserInfoOnSignIn`, will see the primary address for these users.
