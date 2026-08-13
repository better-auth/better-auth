---
"@better-auth/sso": patch
---

Unify SAML response processing and fix provider and configuration handling.

**Bug fixes:**

- Fix SP metadata endpoint using internal row ID instead of `providerId` in ACS URL
- Fix `acsEndpoint` skipping DB provider lookup when `defaultSSO` is configured
- Fix `acsEndpoint` missing encryption fields (`isAssertionEncrypted`, `encPrivateKey`), which caused silent decryption failures
- Fix `defaultSSO` config parsing in callback path (`safeJsonParse` on already-parsed objects)
- Generate the default ACS URL from `baseURL` and `providerId`; `callbackUrl`
  remains a post-auth redirect
- Complete `createSP`/`createIdP` helpers with all encryption and signing fields

**Behavioral changes:**

- ACS error redirects now use the full lowercase code, such as
  `error=saml_multiple_assertions` instead of `error=multiple_assertions`.
- SAML provider registration now rejects configs with no usable IdP entry point (no valid `entryPoint` URL, no `idpMetadata.metadata`, and no `idpMetadata.singleSignOnService`). Previously these would register successfully but fail at sign-in.
- `entryPoint` validation tightened from `startsWith("http")` to `new URL()` parsing, rejecting malformed URLs like `http:evil` or `http//missing-colon`.

**Refactoring (no API changes):**

- Extract shared `processSAMLResponse` pipeline to eliminate ~500 lines of duplicated logic between `callbackSSOSAML` and `acsEndpoint`
- Move `validateSAMLTimestamp` to `saml/timestamp.ts` (re-exported from original location for compatibility)
