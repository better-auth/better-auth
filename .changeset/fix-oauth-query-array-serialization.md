---
"@better-auth/oauth-provider": patch
---

fix(oauth-provider): preserve multi-valued query params through prompt redirects

- `serializeAuthorizationQuery` now uses `params.append()` for array values instead of `String(array)` which collapsed them into a single comma-joined entry.
- `deleteFromPrompt` return type widens from `Record<string, string>` to `Record<string, string | string[]>`. The previous type was incorrect — `Object.fromEntries()` silently dropped duplicate keys, so the narrower type only held because the data was being corrupted.
