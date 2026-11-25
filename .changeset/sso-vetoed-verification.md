---
"@better-auth/sso": patch
---

SSO no longer returns a domain verification token, or redirects to a SAML identity provider, when a `verification.create.before` database hook returns `false` for the record that backs it. Provider registration with domain verification, `/sso/request-domain-verification`, and SAML sign-in with `InResponseTo` validation now fail with `FAILED_TO_CREATE_VERIFICATION` (HTTP 500). A failed registration rolls back the provider on adapters that support transactions, so it can be retried. SP-initiated SAML logout still revokes the local session, because the logout response does not require the stored request.
