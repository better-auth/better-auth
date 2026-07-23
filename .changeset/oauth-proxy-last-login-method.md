---
"better-auth": patch
---

The last-login-method plugin now records the provider for OAuth sign-ins that complete through the oAuthProxy plugin. The proxy finishes the session at `/oauth-proxy-callback`, a path the plugin did not recognize, so the `better-auth.last_used_login_method` cookie (and the optional database field) were never set for proxied OAuth logins. The proxy now carries the provider id as a `provider` query param on the callback and verifies it against the decrypted, authenticated profile before creating the session, so the value recorded by the plugin cannot be tampered with.
