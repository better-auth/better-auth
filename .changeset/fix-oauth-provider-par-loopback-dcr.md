---
"@better-auth/oauth-provider": patch
---

fix PAR scope loss, loopback redirect matching, and DCR skip_consent

- **PAR (RFC 9126)**: resolve `request_uri` into stored params before processing; discard front-channel URL params per §4 to prevent prompt/scope injection
- **Loopback (RFC 8252 §7.3)**: port-agnostic redirect URI matching for `127.0.0.1` and `[::1]`; scheme, host, path, and query must still match
- **DCR**: accept `skip_consent` in schema but reject it during dynamic registration to prevent privilege escalation
- **Serialization**: fix `oAuthState` query serialization and preserve non-string values like `max_age`
