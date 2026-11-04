---
"@better-auth/oauth-provider": patch
---

Back-channel logout no longer sends Logout Tokens to a `backchannel_logout_uri` whose hostname resolves to a loopback, private, link-local, cloud-metadata, or other non-public address. Registration only checked the hostname as written, so a public-looking name with an internal DNS record passed. The provider now checks the stored URI again before each delivery and, on runtimes that provide `node:dns`, resolves its hostname; elsewhere only the hostname check applies. If the lookup fails or any resolved address is not public, it skips that client and logs a warning. The session's tokens are still revoked. Relying parties whose hostnames resolve only to public addresses are unaffected.
