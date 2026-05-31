---
"better-auth": patch
---

Harden server-only endpoints against accidental HTTP exposure.

Some endpoints are reachable only through `auth.api.*`, such as the organization `addMember`, two-factor backup-code retrieval, and JWT signing. They were kept off the HTTP router only by omitting their path. That signal was invisible and fragile: adding a path string would have silently turned a trusted server-only operation into a public, unauthenticated route. These endpoints now use `createAuthEndpoint.serverOnly`, which marks them `SERVER_ONLY` so the router skips them even if a path is later added. A test fails the build if any server-only endpoint becomes HTTP-reachable. Existing `auth.api.*` callers are unaffected.
