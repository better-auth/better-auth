---
"@better-auth/sso": patch
---

Fixes SAML Single Logout (`saml.enableSingleLogout`) for users who signed in more than once with the same NameID, such as on two devices, when the app uses the Prisma or MongoDB adapter.

When one of those sessions was refreshed, the logout record of a different session was extended. The refreshed session's own record then expired with its original expiry, so an IdP-initiated LogoutRequest no longer ended that session. Each refresh now extends the refreshed session's own record.
