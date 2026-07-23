---
"better-auth": patch
---

`getOAuthState` now accepts an optional generic type parameter so the documented usage `getOAuthState<{ callbackURL: string }>()` type-checks. The runtime behavior is unchanged; the function still returns the merged `OAuthState | null` shape, but supplying `<T>` widens the resolved value to `(OAuthState & T) | null` for typed access to fields previously merged in via `setOAuthState`.
