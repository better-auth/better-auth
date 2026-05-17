---
"@better-auth/sso": minor
---

**Breaking changes**

The top-level `samlConfig.cert` field is removed. SAML signing certificates now live under `samlConfig.idpMetadata.cert`. Move the value over verbatim:

```ts
// before
samlConfig: { cert: pem, /* ... */ }

// after
samlConfig: { idpMetadata: { cert: pem }, /* ... */ }
```

If your IdP publishes a metadata XML document and you pass it as `samlConfig.idpMetadata.metadata`, drop `cert` entirely. The document already carries the signing certificates.

Registration now requires exactly one certificate source. Two new error codes enforce this:

- `SAML_CERT_SOURCE_CONFLICT`: `idpMetadata.metadata` is set together with `idpMetadata.cert`. Use one or the other.
- `SAML_CERT_SOURCE_MISSING`: neither is set. One is required.

The management endpoints (`getSSOProvider`, `listSSOProviders`, `updateSSOProvider`) return `samlConfig.certificate` in three shapes. A single parsed certificate when one is configured, an array when several are, and absent when the certificates live inside `idpMetadata.metadata`.

**Rolling certificate rotation**

`samlConfig.idpMetadata.cert` accepts either a single PEM string or an array. During a rotation, pass both the current and the upcoming PEM; SAML responses signed by either are accepted, so users stay signed in across the cutover.

```ts
idpMetadata: {
    cert: [currentPem, nextPem],
}
```

**Fix**

The SAML Single Logout callback could fail to decrypt encrypted `LogoutResponse` payloads because the IdP entity was constructed without `privateKey`, `encPrivateKey`, or `encPrivateKeyPass` on that code path. All three are now applied on every IdP construction.
