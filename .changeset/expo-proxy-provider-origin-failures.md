---
"@better-auth/expo": patch
---

The Expo authorization proxy no longer logs a provider configuration error on every OAuth sign-in when a social provider is set up for ID token sign-in only, such as Apple without a client secret.
