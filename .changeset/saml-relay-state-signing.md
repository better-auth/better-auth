---
"better-auth": patch
---

fix(sso): include RelayState in signed SAML AuthnRequests per SAML 2.0 Bindings §3.4.4.1

- RelayState is now passed to samlify's ServiceProvider constructor so it is included in the redirect binding signature. Previously it was appended after the signature, causing spec-compliant IdPs to reject signed AuthnRequests.
- `authnRequestsSigned: true` without a private key now throws instead of silently sending unsigned requests.
