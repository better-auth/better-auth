---
"@better-auth/core": patch
"@better-auth/electron": patch
"@better-auth/expo": patch
"better-auth": patch
---

One Tap, Electron, and Expo client plugins now compose with `createAuthClient` without TypeScript errors, and the resulting client preserves each plugin's inferred actions.
