---
"@better-auth/oauth-provider": patch
---

fix(oauth-provider): complete stale `prompt=login consent` continuations after forced login

Consent continuations now carry the signed authorization request issue time and
only clear a lingering `login` prompt when the active session was created for
that request. This preserves forced reauthentication semantics while avoiding
the loop where a completed reauthentication is sent back to `/login`.
