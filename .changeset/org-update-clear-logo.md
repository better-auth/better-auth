---
"better-auth": patch
---

You can now clear an organization's logo by passing `logo: null` to `createOrganization` and `updateOrganization`. Previously only a string was accepted, so an existing logo could not be removed.
