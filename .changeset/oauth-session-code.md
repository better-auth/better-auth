---
"@better-auth/oauth-provider": minor
---

Add an opt-in exchange that turns a live OAuth refresh token into a one-time code a browser can redeem for a session cookie. Only clients the server lists, or trusted clients when no list is set, can use it. A registered third-party client cannot turn its refresh token into an account session.
