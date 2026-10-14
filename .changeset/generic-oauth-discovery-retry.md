---
"better-auth": patch
---

Generic OAuth providers configured with `discoveryUrl` now recover without a restart when discovery fails at startup. Since 1.7.3, a provider whose discovery request failed at boot (for example, because the identity provider was still starting) was skipped, and every sign-in returned `PROVIDER_NOT_FOUND` until the app restarted. Better Auth now retries discovery on the next sign-in, callback, or account-linking request for that provider, and the provider works as soon as discovery succeeds. While discovery keeps failing, those requests still return `PROVIDER_NOT_FOUND`, and each may wait up to 10 seconds for the retry.
