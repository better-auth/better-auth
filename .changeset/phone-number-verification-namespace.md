---
"better-auth": patch
---

Phone number verification and password reset codes are now stored under their own namespaces, so a phone number request can no longer create, consume or delete verification codes that belong to other flows. Codes sent before the upgrade must be requested again.
