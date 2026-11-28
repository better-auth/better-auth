---
"better-auth": patch
---

Impersonating a user no longer deletes that user's real sessions or adds the temporary impersonation session to the device-session list. Stopping impersonation restores the admin session without disturbing the impersonated user's devices.
