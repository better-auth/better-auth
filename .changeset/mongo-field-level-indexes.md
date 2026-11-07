---
"@better-auth/mongo-adapter": patch
---

The MongoDB adapter now creates indexes for schema fields marked `unique` or `index`, so concurrent sign ups with the same email can no longer create duplicate users. Existing duplicates are logged instead of blocking writes.
