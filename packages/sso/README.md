# Better Auth SSO Plugin

Single Sign-On plugin for [Better Auth](https://www.better-auth.com) — add SAML and OIDC enterprise SSO to your application.

## Installation

```bash
npm install @better-auth/sso
```

## Documentation

For full documentation, visit [better-auth.com/docs/plugins/sso](https://www.better-auth.com/docs/plugins/sso).

## Pluggable SAML executor

By default, SAML AuthnRequest construction and Response parsing run in-process via [samlify](https://github.com/tngan/samlify).

For constrained runtimes (for example Cloudflare Workers with a tight CPU budget), you can supply a **transport-agnostic** `saml.executor` that implements the same two operations anywhere else (HTTP, RPC, a Node process, WASM, …). Better Auth still owns domain discovery, provider registry, InResponseTo / replay storage, user provisioning, session cookies, and **operator algorithm allowlists**.

```ts
import { betterAuth } from "better-auth";
import { createLocalSAMLExecutor, sso } from "@better-auth/sso";

// Reference implementation (Node-capable hosts / default path):
// const local = createLocalSAMLExecutor();

export const auth = betterAuth({
  plugins: [
    sso({
      saml: {
        executor: {
          createLoginRequest: (input) => myBridge.rpc("createLoginRequest", input),
          parseLoginResponse: (input) => myBridge.rpc("parseLoginResponse", input),
        },
      },
    }),
  ],
});
```

**Contract**

| Side | Responsibility |
|------|----------------|
| Better Auth | Provider lookup by domain, state / InResponseTo, replay, sessions, algorithm allowlists |
| `SAMLExecutor` | Build AuthnRequest (`redirectUrl` + `id`); cryptographically parse/verify Response → extract |

Custom executors must:

1. Set `signatureValidated: true` after verifying signatures  
2. Return **decrypted** `samlContent` (no `EncryptedAssertion`) so assertion-id replay works  
3. Return `sigAlg` (and `keyEncryptionAlgorithm` / `dataEncryptionAlgorithm` when the original assertion was encrypted) so host allowlists still apply after decryption  

`SAMLParseLoginResponseInput.algorithms` carries the operator policy for executors that also enforce it remotely; Better Auth **always** re-applies allowlists on the host using returned metadata.

Use `createLocalSAMLExecutor()` on any Node-capable host if you want crypto to match the default path.

## License

MIT
