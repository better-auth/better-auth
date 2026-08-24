---
"better-auth": minor
---

feat(anonymous): add `onLink: "promote"` to upgrade the anonymous user in place instead of creating a second user

When enabled, an anonymous user who signs up or signs in with a brand-new credential keeps their user id: the anonymous row is updated with the credential's identity and `isAnonymous` is cleared, the newly created account/session rows are re-pointed at the anonymous user, existing sessions stay valid, and the transient second user row is removed in the same transaction — so no `onLinkAccount` data migration is needed. When the credential resolves to an already-existing user, the classic flow (`onLinkAccount` + anonymous deletion) runs as before.
