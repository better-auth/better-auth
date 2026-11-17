---
"@better-auth/oauth-provider": minor
---

Back-channel logout no longer sends a Logout Token to a `backchannel_logout_uri` whose host name resolves to a loopback, private, link-local, cloud-metadata, or other non-public address. Registration only checked the host name as written, so a public-looking name with an internal DNS record passed. Before each delivery, the provider resolves the host name, and if the lookup fails or any address is not public, it skips that client, logs `back-channel logout to client <id> skipped: backchannel_logout_uri ...`, and still revokes the session's access tokens and its refresh tokens that were not issued with `offline_access`. The DNS check runs only on runtimes where `node:dns` resolves names. Elsewhere, only the host name check applies.

If a relying party sits on an internal network and its public-looking name resolves to a private address, list its origin in `trustedOrigins` to keep delivering to it. Search your logs for the warning above to find the clients that stopped receiving tokens. An origin in `trustedOrigins` skips only the DNS check, and a loopback or private IP literal or a name such as `localhost` is still rejected. Delivery reads the origins configured at initialization, so an origin that only a request-dependent `trustedOrigins` callback or the request's Host header supplies does not count.

Clients choose their own `backchannel_logout_uri`. A pattern such as `https://*.example.com` in `trustedOrigins`, which other features may already use, skips the DNS check for every client whose URI matches it. List exact origins.
