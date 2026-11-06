---
"better-auth": patch
---

Generic OAuth providers configured with `discoveryUrl` now keep accepting OAuth callback sign-ins after the provider starts signing ID tokens with an algorithm it newly lists in its discovery document, such as a move from ES256 to RS256. Previously these sign-ins failed until the app restarted. When an ID token uses an algorithm that is not on the list, the discovery document is read again, at most once every 30 seconds.
