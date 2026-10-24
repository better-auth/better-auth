---
"better-auth": patch
---

The organization invitation endpoints that check `emailVerified` (accept, reject, get and list user invitations) now read the session from the database instead of the session cookie cache. A user who verifies their email after signing in can act on an invitation right away instead of being rejected until the cache expires, and a session revoked on another device can no longer accept or reject an invitation within the cache window.
