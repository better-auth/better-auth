---
"@better-auth/oauth-provider": minor
---

The provider now refetches a client's `jwks_uri` for an unknown key at most once every 60 seconds per `jwks_uri` in each server process. Before, every `private_key_jwt` assertion naming a key missing from the cached key set made the provider call the client's endpoint, so anyone who knew a `client_id` could trigger those calls repeatedly. An assertion signed with a key missing from the cached key set now fails with `invalid_client` if another unknown-key refetch of that `jwks_uri` started in the last 60 seconds, even when that refetch failed, unless a request has already cached a set that holds the key. To rotate keys without failures, keep the `jwks_uri` reachable, publish the new key and wait 5 minutes before signing with it.
