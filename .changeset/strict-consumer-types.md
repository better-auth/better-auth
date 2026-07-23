---
"@better-auth/core": patch
"@better-auth/electron": patch
"@better-auth/expo": patch
"better-auth": patch
---

Strict TypeScript consumers can now compose the One Tap, Electron, and Expo client plugins without incompatible fetch signatures. OAuth and Web Crypto helpers also compile with exact optional properties and browser buffer types without consumer-side casts.
