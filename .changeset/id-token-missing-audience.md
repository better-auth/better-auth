---
"@better-auth/core": patch
---

ID token sign-in now rejects tokens when the provider has no client ID, because their audience cannot be checked and a token issued to another app would otherwise be accepted. Set `clientId` on the provider to every client ID your apps sign in with.
