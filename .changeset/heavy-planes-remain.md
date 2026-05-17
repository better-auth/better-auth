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

**Validation**

Registration now rejects SAML configs that supply no signing-cert source. samlify needs either an `idpMetadata.metadata` XML document (which embeds the certs) or an explicit PEM under `cert` or `idpMetadata.cert`. Configs missing both fail with `SAML_CERT_SOURCE_MISSING`.

The management endpoints (`getSSOProvider`, `listSSOProviders`, `updateSSOProvider`) return `samlConfig.certificate` in three shapes: a single parsed certificate when one is configured, an array when several are, and absent when the certs live inside `idpMetadata.metadata`.

**Fix**

SAML Single Logout could fail to decrypt encrypted `LogoutResponse` payloads because the IdP entity was constructed without `privateKey`, `encPrivateKey`, or `encPrivateKeyPass` on that code path. All three are now applied on every IdP construction.
