---
"@better-auth/sso": patch
---

Verify SAML assertion signatures directly instead of trusting an already-parsed response, and enforce a signing policy and size limit on SP metadata the same way IdP metadata is already enforced. `wantAssertionsSigned` now controls whether the SP requires signed assertions instead of signed response messages, matching how IdPs sign SAML responses in practice.

A SAML callback that supplies RelayState now validates it unconditionally; a malformed or expired value is rejected even when `enableInResponseToValidation` is disabled. Service Provider metadata with an ACS location containing a URL fragment is rejected.

Redact provider claims and resolver-thrown errors from log output on SAML and OIDC resolution failures.
