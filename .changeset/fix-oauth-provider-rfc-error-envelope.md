---
"@better-auth/oauth-provider": minor
---

fix(oauth-provider): return RFC-compliant `{ error, error_description }` envelopes from validation failures

An internal `createOAuthEndpoint` wrapper now translates zod validation failures into the envelope required by RFC 6749 §5.2, 7009 §2.2.1, 7662 §2.3, and 7591 §3.2.2. Failing issues are routed per field:

- an absent required value maps to `fieldErrors[name].missing` or the endpoint's `defaultError`.
- an unsupported value (unknown enum member) maps to `fieldErrors[name].invalid` or `defaultError`.
- any other failure (wrong type, duplicated query params, invalid format, refinement) maps to `defaultError`, so RFC 6749 §3.1 malformed requests emit the endpoint's default code regardless of field.

All six OAuth endpoints (`/oauth2/token`, `/oauth2/authorize`, `/oauth2/revoke`, `/oauth2/introspect`, `/oauth2/register`, `/oauth2/end-session`) now return RFC-compliant errors for malformed requests. `/oauth2/authorize` validation failures redirect to the relying party with `error`, `error_description`, echoed `state`, and `iss` whenever `client_id` and `redirect_uri` resolve against the registered client; requests without a trusted RP fall back to the server error page.
