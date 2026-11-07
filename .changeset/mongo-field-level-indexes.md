---
"@better-auth/mongo-adapter": patch
---

The MongoDB adapter now creates indexes for schema fields marked `unique` or `index`. Once the unique index on `user.email` exists, concurrent sign ups with the same email can no longer create duplicate users. If an index cannot be created, for example because of existing duplicates, the adapter logs an error and keeps serving requests without it.
