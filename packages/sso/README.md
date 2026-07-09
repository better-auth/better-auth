# Better Auth SSO Plugin

Single Sign-On plugin for [Better Auth](https://www.better-auth.com) — add SAML and OIDC enterprise SSO to your application.

## Installation

```bash
npm install @better-auth/sso
```

## Documentation

For full documentation, visit [better-auth.com/docs/plugins/sso](https://www.better-auth.com/docs/plugins/sso).

## Pluggable SAML executor

By default, AuthnRequest construction and Response parsing run in-process via [samlify](https://github.com/tngan/samlify).

On constrained runtimes (e.g. Cloudflare Workers), plug in a **transport-agnostic** `saml.executor`. Better Auth still owns domain discovery, provider registry, InResponseTo / replay, user provisioning, sessions, and **operator algorithm policy**.

```ts
import {
  betterAuth,
} from "better-auth";
import {
  createLocalSAMLExecutor,
  createSAMLCryptoReport,
  sso,
} from "@better-auth/sso";

export const auth = betterAuth({
  plugins: [
    sso({
      saml: {
        executor: {
          createLoginRequest: (input) => bridge.rpc("createLoginRequest", input),
          parseLoginResponse: (input) => bridge.rpc("parseLoginResponse", input),
        },
      },
    }),
  ],
});
```

### Library contract

| Piece | Role |
|-------|------|
| `SAMLExecutor` | Build AuthnRequest; parse/verify Response |
| `SAMLCryptoReport` | First-class crypto report from every parse |
| `createSAMLCryptoReport()` | Helper to build the report (auto-fills encryption algs from source XML) |
| `enforceSAMLCryptoPolicy()` | Host applies `SSOOptions.saml.algorithms` allowlists |
| Better Auth routes | Domain discovery, state, replay, sessions |

Custom executor parse result (shape):

```ts
{
  extract: { nameID, attributes, … },
  samlContent: "<Assertion…/>", // decrypted — no EncryptedAssertion
  entityId: "…",
  idpEntityId: "…",
  crypto: createSAMLCryptoReport({
    signatureVerified: true,
    signatureAlgorithm: "http://www.w3.org/2001/04/xmldsig-more#rsa-sha256",
    // If the assertion was encrypted, either pass sourceXml before decrypt:
    // sourceXml: originalResponseXml,
    // or set encryption explicitly:
    encryption: {
      keyTransportAlgorithm: "http://www.w3.org/2001/04/xmlenc#rsa-oaep-mgf1p",
      dataEncryptionAlgorithm: "http://www.w3.org/2009/xmlenc11#aes256-gcm",
    },
    // encryption: null  // when the assertion was never encrypted
  }),
}
```

Default path: `createLocalSAMLExecutor()` — same samlify behavior, same report shape.

## License

MIT
