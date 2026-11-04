---
"better-auth": patch
---

fix(admin): make `create-user` create the user and credential account atomically

- Wrap the `createUser` and `linkAccount` calls in the admin `create-user` endpoint in `runWithTransaction`, so a failure between them rolls both back instead of leaving a committed user with no credential account (and no working sign-in method).
