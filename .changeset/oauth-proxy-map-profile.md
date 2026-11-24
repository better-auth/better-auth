---
"better-auth": patch
---

fix(oauth-proxy): relay `mapProfileToUser` fields through the production → preview passthrough payload so additional user schema fields survive proxied sign-in.
