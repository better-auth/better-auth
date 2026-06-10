---
"@better-auth/core": patch
---

Stop mapping the Reddit `oauth_client_id` to the user's email. Reddit's `identity` scope does not return an email address, and the provider previously stored `oauth_client_id` (which identifies the OAuth application and is the same for every user of the app) as `user.email` with `has_verified_email` as `emailVerified`. This collapsed all Reddit users of the same app onto a single "verified" email, which could enable implicit account linking/takeover. The Reddit provider now uses the email returned from `mapProfileToUser` when provided, otherwise falls back to a unique per-user synthetic address (`<reddit-user-id>@reddit.com`), and no longer marks it as verified. Provide a real email via `mapProfileToUser` if you need the actual address.
