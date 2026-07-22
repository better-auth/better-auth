---
"@better-auth/expo": minor
---

Prevent Expo apps from crashing synchronously when iOS Keychain storage is unavailable by using asynchronous SecureStore access. `getCookie()` now returns a promise, custom storage implementations must provide both synchronous and asynchronous SecureStore methods, and `storageAdapter.setItem()` is synchronous, so use `setItemAsync()` when the write must be awaited.
