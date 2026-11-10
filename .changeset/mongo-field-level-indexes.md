---
"@better-auth/mongo-adapter": patch
---

If you use the MongoDB adapter, it now creates indexes for schema fields marked `unique` or `index`, such as `user.email` and `session.token`. Before, nothing enforced these fields on MongoDB, so concurrent sign-ups with the same email could create duplicate users.

The indexes build in the background when the adapter starts, and requests don't wait for them. Most deployments need no action.

In these cases, the adapter logs an error, keeps serving requests, and leaves your data unchanged. Uniqueness for the affected field is not enforced until you act:

- The collection already contains duplicate values. Remove them as the MongoDB adapter docs describe, then restart.
- Your database user lacks the `createIndex` permission. Grant it, or create the indexes yourself.
- Another index on the same field has different options. Drop it, then restart.
