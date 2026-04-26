---
"better-auth": minor
"@better-auth/core": minor
"@better-auth/sso": minor
---

feat(oauth): per-request `additionalParams` and `loginHint` parity across `signIn.social`, `linkSocial`, and `signIn.sso`

Unified escape hatch for customizing the provider authorization URL on a per-request basis. Previously, dynamic parameters like Google's `access_type=offline` / `prompt=consent`, Cognito's `identity_provider=Google`, or Microsoft's `domain_hint` could only be set as static server configuration.

### New capabilities

- `signIn.social`, `linkSocial`, and `signIn.sso` accept `additionalParams: Record<string, string>`. Values are appended to the authorization URL as query parameters.
- `linkSocial` also accepts `loginHint`, matching the surface of `signIn.social` and `signIn.sso`.
- `OAuthProvider.createAuthorizationURL` gains `additionalParams` in its input contract; every built-in provider forwards it to the shared helper.
- Generic-OAuth providers merge call-time `additionalParams` with the config-level `authorizationUrlParams`; call-time wins on key collision.
- Cognito exposes a typed `identityProvider?: string` config option that maps to the `identity_provider` query parameter, avoiding magic strings.

### Security

- The shared `createAuthorizationURL` helper silently drops any caller-supplied key in `RESERVED_AUTHORIZATION_PARAMS` (`state`, `client_id`, `redirect_uri`, `response_type`, `code_challenge`, `code_challenge_method`, `scope`). The request-body Zod schema rejects the same keys with 400, so misuse is visible at the edge rather than silently overriding security-critical parameters.
- Providers that use non-standard client identifiers (`wechat` → `appid`, `tiktok` → `client_key`) additionally filter those keys so a caller cannot swap the configured OAuth app.
- Provider protocol constants that are required for the integration to function (`atlassian` → `audience`, `notion` → `owner`) are merged last so caller-supplied `additionalParams` cannot override them. Configured defaults that represent operator intent (e.g. Google `include_granted_scopes`, Cognito `identityProvider`) remain caller-overridable.

### OpenAPI

- Added `ZodRecord` handling to the OpenAPI generator so `z.record()` fields emit `type: object` with typed `additionalProperties`. Incidentally fixes the long-standing misrendering of `additionalData` as a string.

### Refactors

- `discord`, `roblox`, `zoom`, and `slack` providers now delegate to the shared `createAuthorizationURL` helper and inherit its RFC behavior and reserved-key guard.
- `tiktok` and `wechat` keep their manual URL construction (non-standard OAuth2 parameter names and URL fragment requirements) but thread `additionalParams` with the same reserved-key filter.

Closes #2351.
Closes #5441.
Closes #5592.
Closes #5604.
Supersedes #4992 and #5443.
