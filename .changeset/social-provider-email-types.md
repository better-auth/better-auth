---
"@better-auth/core": patch
"better-auth": patch
---

fix(oauth): support `mapProfileToUser` fallback for providers that may omit email

Social sign-in with OAuth providers that may return no email address (Discord phone-only accounts, Apple subsequent sign-ins, GitHub private emails, Facebook, LinkedIn, and Microsoft Entra ID managed users) can now be unblocked by synthesizing an email inside `mapProfileToUser`. Rejection logger messages now point at this workaround and at the new ["Handling Providers Without Email"](https://www.better-auth.com/docs/concepts/oauth#handling-providers-without-email) docs section.

Provider profile types now reflect where `email` can be `null` or absent:

- `DiscordProfile.email` is `string | null` and optional (absent when the `email` scope is not granted)
- `AppleProfile.email` is optional
- `GithubProfile.email` is `string | null`
- `FacebookProfile.email` is optional
- `FacebookProfile.email_verified` is optional (Meta's Graph API does not include this field)
- `LinkedInProfile.email` is optional
- `LinkedInProfile.email_verified` is optional
- `MicrosoftEntraIDProfile.email` is optional

TypeScript consumers who previously dereferenced `profile.email` directly inside `mapProfileToUser` will see a compile error that matches the runtime reality; use a nullish-coalescing fallback (`profile.email ?? ...`) or null-check the field.

Sign-in still rejects with `error=email_not_found` (social callback) or `error=email_is_missing` (Generic OAuth plugin) when neither the provider nor `mapProfileToUser` produces an email. First-class support for users without an email, keyed on `(providerId, accountId)` per OpenID Connect Core §5.7, is tracked in [#9124](https://github.com/better-auth/better-auth/issues/9124).
