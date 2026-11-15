---
"@better-auth/mcp": minor
---

`requireMcpAuth` now passes the handler the `sub` the access token carries instead of the internal user ID. For a client with `subject_type: "pairwise"`, an opaque token's `sub` is now its pairwise subject, as at `/oauth2/introspect`, and a JWT's `sub` is the pairwise subject when the provider sets `accessTokenSubject: "pairwise"`. Other tokens keep the user ID.

**Breaking for 1.8.0-beta.10 users:** beta.10 passed the user ID even for pairwise tokens. An MCP handler that looks users up by `sub` for pairwise clients must now map the pairwise subject itself, or keep those clients on `subject_type: "public"`.
