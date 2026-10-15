---
"@better-auth/oauth-provider": patch
---

With `clientRegistrationDefaultApplicationType: "infer"`, clients that register an `http` callback on `localhost`, `127.0.0.1`, or `[::1]` without `application_type` now register as `native`. This includes Claude Code, which registers `http://127.0.0.1:<port>/callback`. Before, `"infer"` chose `native` only for custom-scheme callbacks, so these registrations were treated as `web` and rejected with `invalid_redirect_uri`. The `"web"` default and the `"native"` setting are unchanged, and an `application_type` the client sends is never overridden.
