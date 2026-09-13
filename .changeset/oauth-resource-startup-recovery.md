---
"@better-auth/oauth-provider": patch
---

Prevent a failed startup resource seed from permanently breaking session and login requests. Log the failure and retry seeding on resource access, while continuing to reject OAuth requests when resource storage is unavailable.
