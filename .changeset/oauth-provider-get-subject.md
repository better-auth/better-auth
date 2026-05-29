---
"@better-auth/oauth-provider": minor
---

Add an optional `getSubject` hook so a multi-tenant issuer can return a per-(user, workspace) OIDC `sub` while keeping a single login and session per human.

By default the subject is the raw `user.id` (unchanged). When `getSubject` is set, its return value becomes the *base* subject and pairwise hashing — when the client opts in — still applies on top. Resolution happens only at the presentation layer (the id token, `/userinfo`, and `/introspect`); the access token's internal `sub` always stays the raw `user.id` so it remains the lookup key used to load the user in `/userinfo`.

```ts
oauthProvider({
  pairwiseSecret: process.env.PAIRWISE_SECRET,
  postLogin: {
    page: "/post-login",
    shouldRedirect: async () => false,
    // `session` carries your custom fields as `unknown`; narrow to a string
    consentReferenceId: ({ session }) => {
      const membershipId = session.activeWorkspaceMembershipId;
      return typeof membershipId === "string" ? membershipId : undefined;
    },
  },
  getSubject: ({ userId, referenceId }) => referenceId ?? userId,
});
```

`referenceId` is the value produced by `postLogin.consentReferenceId` and persisted with the grant/token. Opaque access tokens re-resolve the subject from their database record, so `referenceId` never leaves the server. JWT access tokens are stateless, so the already-resolved subject — the same value the client receives as the id token `sub` — is embedded as an internal claim and consumed (and stripped) at `/userinfo` and `/introspect`; the raw `referenceId` is never embedded, preserving pairwise subject isolation. Flows without a consent reference (such as `client_credentials`) pass `referenceId: undefined`, so implementations should fall back to `userId`.

`getSubject` must be deterministic for a given `(userId, referenceId)` and must return `userId` when `referenceId` is `undefined`: the internal claim is omitted when the resolved subject equals `user.id` (keeping default tokens byte-for-byte unchanged), and the presentation layer recomputes the subject in that case. Note also that the access token's top-level `sub` is the raw, cross-workspace `user.id`; relying parties that validate JWT access tokens statelessly will read it, so issue **opaque** access tokens to external RPs (introspection returns the resolved subject and never exposes the raw reference) and reserve JWT access tokens for first-party use.

Because a JWT access token's `sub` is the raw `user.id`, issuing one to a `pairwise` client does not preserve pairwise subject isolation, so a one-time dev warning is logged in that case. Configure such clients to receive **opaque** access tokens, or silence it with `silenceWarnings.pairwiseJwtAccessToken` once you've accepted the trade-off.
