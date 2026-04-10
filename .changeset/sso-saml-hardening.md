---
"@better-auth/sso": patch
---

fix(sso): unify SAML response processing and fix provider/config bugs

- Fix SP metadata endpoint using internal row ID instead of `providerId` in ACS URL
- Fix `acsEndpoint` skipping DB provider lookup when `defaultSSO` is configured
- Fix `acsEndpoint` missing encryption fields (`isAssertionEncrypted`, `encPrivateKey`), which caused silent decryption failures
- Add registration-time validation: reject SAML configs with no usable IdP entry point
- Extract shared `processSAMLResponse` pipeline to eliminate ~500 lines of duplicated logic between `callbackSSOSAML` and `acsEndpoint`
- Complete `createSP`/`createIdP` helpers with all encryption and signing fields
