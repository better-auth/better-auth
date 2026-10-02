---
"@better-auth/oauth-provider": patch
---

Prevent a database error during startup resource seeding from permanently breaking session and login requests. Preserve custom validator exceptions. Log the storage failure and retry seeding on resource access, while continuing to reject OAuth requests when resource storage is unavailable.
