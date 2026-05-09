---
"better-auth": patch
---

fix(username): respect callbackURL on `/sign-in/username`

The endpoint accepted a `callbackURL` body field but ignored it, so
`authClient.signIn.username({ ..., callbackURL })` silently did nothing
while `authClient.signIn.email` redirected as expected. The handler now
sets a `Location` header when `callbackURL` is provided and returns
`{ redirect, url }` alongside `token`/`user`, matching the email flow.
