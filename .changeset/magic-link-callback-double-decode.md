---
"better-auth": patch
---

Fix magic link verification corrupting a `callbackURL` that contains encoded query values: the verify endpoint no longer decodes `callbackURL`, `newUserCallbackURL` and `errorCallbackURL` a second time, so the redirect and the origin check both use exactly the URL that was passed to `signIn.magicLink`.
