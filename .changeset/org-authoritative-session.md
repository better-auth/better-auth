---
"better-auth": patch
---

Organization routes now read the session from the authoritative source, so a revoked session can no longer reach membership, permission and management checks while the cookie cache is enabled. Stateless signed-cookie deployments keep using the cookie as the session record.
