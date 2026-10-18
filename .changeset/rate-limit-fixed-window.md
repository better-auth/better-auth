---
"better-auth": minor
"@better-auth/core": minor
---

Rate limiting now uses a fixed window anchored to the first request instead of sliding it on every request. Steady traffic below the limit (for example, one request every 59 seconds with `window: 60, max: 20`) is no longer rejected with `429`, and the OAuth device flow polling `/oauth2/token` every 5 seconds no longer fails partway through the device code lifetime. Burst protection is unchanged: requests over `max` within the window are still rejected.

The `rateLimit` table gains a nullable `windowExpiresAt` column holding each row's own window deadline, so a row is only pruned once its own window has elapsed. This matters when `customRules` return different windows, including windows returned by a function: cleanup can no longer delete a counter that a longer window still has open. Rows written before this release keep working — their deadline is derived from `lastRequest` and the window in effect.

If you generate the `rateLimit` schema, run your migration to add the column:

```bash
npx auth@latest generate
```

A minor bump is used because database-backed users must apply a schema migration. `X-Retry-After` is now also clamped to at least 1 second, so a request that arrives as its window ends no longer receives a `0` or negative value.