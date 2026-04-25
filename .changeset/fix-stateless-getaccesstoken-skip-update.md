---
"better-auth": patch
---

fix: skip `internalAdapter.updateAccount` during `getAccessToken` auto-refresh when no `database` is configured. Previously, refreshed tokens triggered a redundant call to the in-memory fallback adapter; with no real DB to update, the call is now skipped and the refreshed tokens are still returned and persisted in the account cookie when `storeAccountCookie` is enabled. Fixes #7703.
