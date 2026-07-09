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

For constrained runtimes (for example Cloudflare Workers with a tight CPU budget), you can supply a **transport-agnostic** `saml.executor` that implements the same two operations anywhere else (HTTP, RPC, a Node process, WASM, …). Better Auth still owns domain discovery, provider registry, InResponseTo / replay storage, user provisioning, and session cookies.

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
| Better Auth | Provider lookup by domain, state / InResponseTo, replay keys, session |
| `SAMLExecutor` | Build AuthnRequest redirect URL + id; parse/verify Response → extract |

Custom executors must set `signatureValidated: true` after verifying signatures, or return `rawParsedResponse` so Better Auth can run its algorithm checks. Use `createLocalSAMLExecutor()` on any Node-capable host if you want crypto to match the default path.

## License

MIT
