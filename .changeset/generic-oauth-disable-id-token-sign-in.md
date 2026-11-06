---
"better-auth": patch
---

Generic OAuth providers accept a `disableIdTokenSignIn` option. When set, `/sign-in/social` and `/link-social` reject a client-submitted `idToken` for that provider, so it only signs in through the authorization code redirect.
