---
"better-auth": minor
---

The organization plugin has a new `resolveMembership` option that overrides how the signed-in user's membership in an organization is resolved.

It runs on every lookup of the caller's own membership (setting an organization active, reading it, checking permissions, and managing members, invitations and teams) and receives the caller's member row or `null`. It returns the effective membership: `member` to keep the default, `null` to refuse, or a membership object with a `role` whose fields merge over the row. It also receives the endpoint context, so it can decide per request, for example by `ctx.path`. Nothing is written to the member table.
