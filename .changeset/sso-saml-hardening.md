---
"@better-auth/sso": patch
---

fix(sso): unify SAML response processing and fix provider/config bugs

**Bug fixes:**

- Fix SP metadata endpoint using internal row ID instead of `providerId` in ACS URL
- Fix `acsEndpoint` skipping DB provider lookup when `defaultSSO` is configured
- Fix `acsEndpoint` missing encryption fields (`isAssertionEncrypted`, `encPrivateKey`), which caused silent decryption failures
- Fix `defaultSSO` config parsing in callback path (`safeJsonParse` on already-parsed objects)
- Fix `createSP` missing `callbackUrl` fallback to auto-generated ACS URL
- Complete `createSP`/`createIdP` helpers with all encryption and signing fields

**Behavioral changes:**

- ACS error redirect query parameters now use uppercase error codes (e.g. `error=SAML_MULTIPLE_ASSERTIONS` instead of `error=multiple_assertions`). If your application parses these error codes from the redirect URL, update the expected values.
- SAML provider registration now rejects configs with no usable IdP entry point (no valid `entryPoint` URL, no `idpMetadata.metadata`, and no `idpMetadata.singleSignOnService`). Previously these would register successfully but fail at sign-in.
- `entryPoint` validation tightened from `startsWith("http")` to `new URL()` parsing, rejecting malformed URLs like `http:evil` or `http//missing-colon`.

**Refactoring (no API changes):**

- Extract shared `processSAMLResponse` pipeline to eliminate ~500 lines of duplicated logic between `callbackSSOSAML` and `acsEndpoint`
- Move `validateSAMLTimestamp` to `saml/timestamp.ts` (re-exported from original location for compatibility)
