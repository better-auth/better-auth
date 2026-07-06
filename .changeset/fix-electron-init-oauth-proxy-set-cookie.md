---
"@better-auth/electron": patch
---

`/electron/init-oauth-proxy` now forwards each Set-Cookie from the inner sign-in response separately. The previous `Headers.get("set-cookie")` returned them as one comma-joined string, so the browser silently dropped the transfer-token cookie that the desktop deep-link handoff needs.
