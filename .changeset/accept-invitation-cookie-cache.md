---
"better-auth": patch
---

Fix `acceptInvitation` leaving a stale `activeOrganizationId` in the session cookie cache. Accepting an invitation now refreshes the cached session, so later `getSession()` calls no longer return the previous active organization when `session.cookieCache.enabled` is `true`.
