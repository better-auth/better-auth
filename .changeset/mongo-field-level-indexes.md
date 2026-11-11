---
"@better-auth/mongo-adapter": patch
---

If you use the MongoDB adapter, it now creates indexes for schema fields marked `unique` or `index`, such as `user.email` and `session.token`. Before, MongoDB did not enforce these fields, so concurrent sign-ups with the same email could create duplicate users. Now a write that repeats a unique value fails instead.

The indexes build in the background when the adapter starts. Most deployments need no action.

If an index cannot be built, the adapter logs an error and keeps serving requests without it. Your data is not changed. Uniqueness for that field is not enforced until you fix the cause and restart:

- The collection already contains duplicate values. Remove them as the MongoDB adapter docs describe.
- Your database user lacks the `createIndex` permission. Grant it, or create the indexes yourself.
- Another index on the same field has different options. Drop it.
