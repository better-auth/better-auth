---
"better-auth": patch
---

Add `better-auth/plugins/one-tap` subpath export so the One Tap plugin can be imported individually like every other plugin (e.g. `one-time-token`, `jwt`, `magic-link`). The build already emitted the artifact; only the `package.json` `exports` field was missing.
