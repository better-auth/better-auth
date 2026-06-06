---
"@better-auth/sso": patch
---

When clockSkew is configured in the SSO plugin's SAML options, it was only
applied to better-auth's internal validation but never passed down to samlify's
ServiceProvider. As a result, samlify used its default [0, 0] clock drift,
causing ERR_SUBJECT_UNCONFIRMED errors on valid SAML responses whenever there
was any clock difference between the SP and the IdP.

This affects any standard IdP (Auth0, Keycloak, Okta, etc.) even when the SAML
response is fully valid and the server time is well within the
NotBefore/NotOnOrAfter window.

This is now fixed.