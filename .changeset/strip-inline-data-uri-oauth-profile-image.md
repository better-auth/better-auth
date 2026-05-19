---
"better-auth": patch
---

fix(oauth): strip inline `data:` URIs from OAuth profile images to prevent `ERR_RESPONSE_HEADERS_TOO_BIG`. Providers like Microsoft Entra ID (via the library's own Graph `/me/photo/$value` fetch) and some Keycloak/OIDC setups embed base64 images as `data:image/...;base64,...` in the `picture` claim. That value cascaded into the session cookie cache and into JWT payloads (the `jwt` plugin signs the full user object by default), silently failing the OAuth callback in browsers because Set-Cookie blew past the per-cookie 4 KB limit and the response past the per-header 16 KB limit (Vercel / nginx default).

`handleOAuthUserInfo` now strips inline `data:` URIs (case-insensitive per RFC 2397) from `user.image` and emits a warn-level log. OIDC Core §5.1 defines `picture` as a URL, so a `data:` URI is non-standard; the prefix is a near-zero-false-positive signal (legitimate signed CDN URLs and Unicode names never start with it).

Opt out with `account.allowInlineProfileImage: true` if you have a `mapProfileToUser` callback or `databaseHooks.user.create.before` hook that hoists the inline image to a CDN. `mapProfileToUser` runs before the sanitizer, so it can still capture the original data URI even when this option is left at the default.

Existing DB rows with bloated `user.image` will be overwritten on the next OAuth callback. To clean immediately:

```sql
UPDATE "user" SET "image" = NULL WHERE "image" LIKE 'data:%';
```

Closes #8338.
