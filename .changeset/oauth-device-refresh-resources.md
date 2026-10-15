---
"@better-auth/oauth-provider": patch
---

Device-code clients that request `offline_access` and poll the token endpoint for only some of the RFC 8707 resources the user approved can now refresh for any approved resource. Previously, a refresh for an approved resource left out of the poll failed with `invalid_target`. Device codes polled without `resource`, or for every approved resource, are unaffected.
