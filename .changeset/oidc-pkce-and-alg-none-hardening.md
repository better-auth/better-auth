---
"better-auth": patch
---

fix(oidc-provider, mcp): drop `"none"` from advertised signing algorithms, default `allowPlainCodeChallengeMethod` to `false`, and reject missing PKCE method

The legacy `oidc-provider` and `mcp` plugins now follow OAuth 2.1 (RFC 9700) on three protocol gates:

- `id_token_signing_alg_values_supported` (oidc-provider, mcp) and `resource_signing_alg_values_supported` (mcp) no longer include `"none"`. Relying parties that negotiate from this list will no longer be steered toward unsigned tokens.
- `allowPlainCodeChallengeMethod` defaults to `false`. Callers who need `plain` PKCE must opt in explicitly.
- Under the secure default the authorize endpoint no longer silently rewrites a missing `code_challenge_method` to `"plain"` before the allowlist check. A request that provides `code_challenge` without `code_challenge_method` is now rejected with `invalid_request`; the inverse case (`code_challenge_method` without `code_challenge`) is also rejected so no inconsistent PKCE state is persisted on the authorization code record.

Non-breaking for callers who never relied on `"none"` advertisement or the plain default. Callers who explicitly set `allowPlainCodeChallengeMethod: true` keep `plain` on the allowlist **and** retain the legacy "missing method defaults to plain" behavior for backward compatibility, so existing integrations that opted into plain PKCE continue to work. The next-minor on `next` will drop both the `plain` allowlist entry and this fallback; until then, the option is the single explicit knob for legacy behavior. Migrate to `@better-auth/oauth-provider` for the canonical, spec-aligned implementation.
