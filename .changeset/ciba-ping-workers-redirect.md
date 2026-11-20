---
"@better-auth/ciba": patch
---

CIBA clients can now receive ping notifications from providers running on Cloudflare Workers. The provider sends the notification only to the registered endpoint and treats a redirect as a failed delivery.
