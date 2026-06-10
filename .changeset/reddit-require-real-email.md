---
"@better-auth/core": patch
---

Stop mapping the Reddit `oauth_client_id` to the user's email. Reddit's `identity` scope does not return an email address, and the provider previously stored `oauth_client_id` (which identifies the OAuth application and is the same for every user of the app) as `user.email` with `has_verified_email` as `emailVerified`. This collapsed all Reddit users of the same app onto a single "verified" email, which could enable implicit account linking/takeover. The Reddit provider now requires a real, user-specific email from `mapProfileToUser` and refuses sign-in when none is available, and no longer applies `has_verified_email` to a synthetic email. To keep using Reddit sign-in, provide an email via `mapProfileToUser`.
