---
"@better-auth/oauth-provider": patch
---

Clients that authenticate with `private_key_jwt` and a `jwks_uri` now trigger at most one refetch of that `jwks_uri` every 60 seconds per server process when an assertion names a key missing from the cached key set. Previously every such assertion made the provider fetch the client's `jwks_uri`, so anyone who knew a `client_id` could make the provider call that endpoint repeatedly. Concurrent assertions now share one fetch.

Key rotation keeps working without waiting for the 5-minute cache to expire. An assertion signed with a newly published key can fail if another refetch of the same `jwks_uri` happened in the last 60 seconds; the client can retry after the cooldown, or wait 5 minutes after publishing a key before signing with it. The rotation procedure is in the OAuth provider docs.
