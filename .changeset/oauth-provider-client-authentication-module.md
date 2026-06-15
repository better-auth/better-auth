---
---

refactor(oauth-provider): move client authentication into a dedicated `client-authentication` module

Relocates client credential extraction, validation, and grant-type checks out of the generic `utils` bucket. Internal only: no public API, behavior, or wire change, so no release.
