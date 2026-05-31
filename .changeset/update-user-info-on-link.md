---
"better-auth": patch
---

Apply `accountLinking.updateUserInfoOnLink` across every OAuth link flow.

Enabling `updateUserInfoOnLink` only synced the user's profile when linking through a direct ID token. Linking through the standard OAuth redirect (`linkSocial`, the generic OAuth `oauth2.link` endpoint, and implicit linking on social sign-in) ignored the option, so the name and image never changed. Every link path now honors it.

The synced fields match the sign-up path: `name`, `image`, and any fields your `mapProfileToUser` adds. The local `email` and `emailVerified` are never changed on a link, so linking a provider cannot rebind the account's identity.

Implicit linking on social sign-in also returned the pre-update user, so the freshly issued session served stale profile data from its cookie cache until the cache expired. The new session now carries the updated profile.
