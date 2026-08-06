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

`referenceId` is the value produced by `postLogin.consentReferenceId` and persisted with the grant, the opaque access token, and the refresh token. The subject is resolved once per token request and reused by the id token; opaque access tokens and refresh tokens re-resolve it from their stored `referenceId` at introspection, and stateless JWT access tokens carry the already-resolved subject — the same value the client receives as the id token `sub` — in a reserved internal claim that is consumed and stripped at `/userinfo` and `/introspect`. The raw `referenceId` is never embedded in a token, preserving pairwise subject isolation. Flows without a consent reference (such as `client_credentials`) pass `referenceId: undefined`.

`getSubject` must be deterministic for a given `(userId, client, referenceId)` and must return a stable, non-empty subject — an empty or blank return is rejected rather than presented. Note that the access token's top-level `sub` is the raw, cross-workspace `user.id`; relying parties that validate JWT access tokens statelessly will read it, so issue **opaque** access tokens to external RPs (introspection returns the resolved subject and never exposes the raw reference) and reserve JWT access tokens for first-party use.
