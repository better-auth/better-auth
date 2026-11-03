---
"@better-auth/expo": patch
---

The Expo authorization proxy now redirects only to the origin of a configured social or generic OAuth provider's authorization endpoint, or of an SSO provider on a trusted origin. If Expo sign-in through an SSO identity provider fails, add the identity provider's origin to `trustedOrigins`.
