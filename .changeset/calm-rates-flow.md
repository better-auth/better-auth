---
"@better-auth/core": major
"@better-auth/oauth-provider": major
"better-auth": major
---

Replace request rate limiting with a policy-based engine supporting fixed-window, sliding-window-counter, token-bucket, and GCRA strategies. Rate-limit keys are now customizable, every storage performs an atomic consume operation, database storage persists versioned algorithm state with compare-and-swap revisions, and `429` responses use the standard `Retry-After` header.
