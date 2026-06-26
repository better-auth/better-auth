---
"better-auth": minor
---

Extend the user model's field-input rules to OAuth/OIDC user provisioning. Fields marked `input: false` that arrive from a provider profile (including via `mapProfileToUser`) are now silently ignored when a user is created or updated through sign-up and account linking, keeping these server-owned fields under your application's control. Apps that previously relied on a provider to set an `input: false` field will need to populate it server-side instead.
