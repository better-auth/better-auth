---
"@better-auth/oauth-provider": patch
---

updated to use ctx.headers?.get("authorization") directly and removed the intermediate headerBag + redundant guard. Missing header is still handled by the existing token-length validation
