---
"@better-auth/expo": patch
---

Fix sign-in being lost on Expo when a provider issues large tokens.

After signing in with a provider whose tokens are large (such as Keycloak), the account cookie could silently fail to persist, leaving `useSession()` null and making `accountInfo` / `getAccessToken` return `ACCOUNT_NOT_FOUND`. The client stored the whole cookie jar as a single value, and native secure stores reject oversized writes, so the cookie never reached the next request.

The Expo storage adapter now splits an oversized value across keys and reassembles it on read, keeping each write within the device limit. Values that already fit are stored unchanged, and a write the backend rejects is logged instead of being dropped silently.
