---
"@better-auth/sso": minor
---

fix(sso)!: harden SAML response validation (InResponseTo, Audience, SessionIndex)

### Breaking Changes

- **`allowIdpInitiated` now defaults to `false`** — IdP-initiated SSO (unsolicited SAML responses) is disabled by default. Set `saml.allowIdpInitiated: true` to restore the previous behavior. This aligns with the SAML2Int interoperability profile which recommends against IdP-initiated SSO due to its susceptibility to injection attacks.

### Bug Fixes

- **InResponseTo validation was completely non-functional** — The code read `extract.inResponseTo` (always `undefined`) instead of samlify's actual path `extract.response.inResponseTo`. SP-initiated InResponseTo validation now works as intended in both ACS handlers.
- **Audience Restriction was never validated** — SAML assertions issued for a different service provider were accepted without checking the `<AudienceRestriction>` element. Audience is now validated against the configured `samlConfig.audience` value per SAML 2.0 Core §2.5.1.
- **SessionIndex stored as object instead of string** — samlify returns `sessionIndex` from login responses as `{ authnInstant, sessionNotOnOrAfter, sessionIndex }`, but the code stored the whole object. SLO session-index comparisons always failed silently. The correct inner `sessionIndex` string is now extracted.

### Improvements

- Extracted shared `validateInResponseTo()` and `validateAudience()` into `packages/sso/src/saml/response-validation.ts`, eliminating ~160 lines of duplicated validation logic between the two ACS handlers.
- Fixed `SAMLAssertionExtract` type to match samlify's actual extractor output shape.
