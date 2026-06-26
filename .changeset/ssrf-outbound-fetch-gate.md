---
"@better-auth/core": minor
"@better-auth/sso": minor
"@better-auth/cimd": minor
"@better-auth/electron": minor
"better-auth": minor
---

Harden server-side requests to provider endpoints against SSRF

Server-side requests that Better Auth makes to OAuth and OIDC provider endpoints now refuse HTTP redirects and verify that the target host is publicly routable, across SSO, the Generic OAuth plugin, built-in social sign-in, dynamic client registration, and the Electron user-image proxy. A provider endpoint can no longer redirect one of these requests to an internal address, and a provider whose hostname resolves to a private, link-local, or cloud-metadata address is rejected. The Electron image proxy re-checks every redirect hop instead of following them blindly. Conformant providers answer these endpoints directly and never redirect, so standard integrations are unaffected.

Migration: if you point the Generic OAuth plugin at an identity provider on a private network, add its origin to `trustedOrigins`. Its discovery, userinfo, and token requests now reject a non-public host unless the origin is trusted. Self-hosted social providers (for example a private GitLab) are unaffected, since their configured host is already trusted.
