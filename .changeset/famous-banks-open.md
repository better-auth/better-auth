---
"better-auth": patch
---

ensures the OAuth callback’s state parameter matches the nonce stored with the flow so cookie-backed state cannot be replayed with an attacker’s authorization code.
