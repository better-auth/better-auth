---
"better-auth": minor
---

`signIn.popup` accepts `additionalParams`, which are appended to the provider authorization URL as in `signIn.social`. Reserved OAuth parameters such as `state` and `redirect_uri` are rejected.
