---
"@better-auth/sso": minor
---

**Rolling certificate rotation**

SAML signing certificates now accept an array of PEM strings, so administrators can publish a new IdP cert alongside the old one and complete the rotation without forcing every active session to re-authenticate. Responses signed by any listed cert are accepted.

```ts
samlConfig: {
    idpMetadata: {
        cert: [currentPem, nextPem],
    },
}
```

Both `samlConfig.cert` and `samlConfig.idpMetadata.cert` accept either a single PEM string or an array. When both are set, `idpMetadata.cert` wins.

**Breaking: response shape**

The management endpoints (`getSSOProvider`, `listSSOProviders`, `updateSSOProvider`) now return `samlConfig.certificate` as an array of parsed certificates in every case, even when a single cert is configured. The field is absent only when certs live inside `idpMetadata.metadata`. Update consumers to read an array; no more `Array.isArray` branching.

**Validation**

Registration now rejects SAML configs that supply no signing-cert source. samlify needs either an `idpMetadata.metadata` XML document (which embeds the certs) or an explicit PEM under `cert` or `idpMetadata.cert`. Configs missing both fail with `CERT_SOURCE_MISSING`.

**Fix**

SAML Single Logout could fail to decrypt encrypted `LogoutResponse` payloads because the IdP entity was constructed without `privateKey`, `encPrivateKey`, or `encPrivateKeyPass` on that code path. All three are now applied on every IdP construction.
