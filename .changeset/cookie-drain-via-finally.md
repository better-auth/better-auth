---
"better-auth": minor
---

Migrate `nextCookies`, `sveltekitCookies`, and `tanstackStartCookies` (React and Solid) cookie integrations to use `hooks.finally`. Cookies set by plugins running later in the array are now forwarded to the framework cookie store regardless of plugin declaration order. Closes #8911.
