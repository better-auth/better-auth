---
"@better-auth/oauth-provider": patch
---

A client discovery can now set `jwksStaleIfError` to keep verifying its clients' assertions with cached `jwks_uri` keys, for up to that many seconds (at most 24 hours), while refetching them fails transiently. Discoveries that don't set it are unchanged. An administrator's edit of a discovered client no longer changes its `updatedAt`, which records when its metadata was last validated.
