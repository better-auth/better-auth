---
"@better-auth/oauth-provider": patch
---

Extend RFC 8252 §7.3 redirect port variance to the `localhost` hostname in the authorize endpoint's redirect matcher. Registration already accepts `http://localhost` redirect URIs for native clients, but the matcher only applied port variance to loopback IP literals — so CIMD clients registering port-less `http://localhost/callback` (e.g. Claude Code) could never complete an authorization from an ephemeral port and were rejected with `invalid_redirect`.
