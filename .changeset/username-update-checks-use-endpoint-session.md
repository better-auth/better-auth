---
"better-auth": patch
---

The `username` plugin now checks usernames on `/update-user` against the session the endpoint resolved, so re-sending your own username with a bearer token no longer fails as already taken. Signed-out `/update-user` calls with a taken username now return 401 like other signed-out calls.
