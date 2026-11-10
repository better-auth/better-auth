---
"better-auth": minor
---

**Breaking for custom One Tap callers:** `/one-tap/callback` now requires a single-use nonce from the new `POST /one-tap/nonce` endpoint, so each Google ID token signs in only once.

If you sign in with `authClient.oneTap()`, there's nothing to change. The client fetches a nonce before each prompt and button render, passes it to Google, and sends it with the ID token. Button mode fetches a new nonce after each sign-in attempt and before the current one expires five minutes after it was issued.

If you call `/one-tap/callback` or `auth.api.oneTapCallback` yourself, call `POST /one-tap/nonce` first, pass the returned `nonce` to `google.accounts.id.initialize({ nonce })`, and send it back as `nonce` in the callback body. Callbacks are now rejected in three cases, all of which were accepted before:

- Without a `nonce`, with `400`.
- With a nonce that is unknown, expired, or already used, with `400 INVALID_ID_TOKEN_NONCE`.
- With a token whose `nonce` claim differs from the nonce, as an invalid ID token.

The client's `nonce` option is now ignored and logs a warning, and a `nonce` in `additionalOptions` is no longer passed to Google. Remove both.
