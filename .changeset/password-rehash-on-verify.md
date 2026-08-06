---
"better-auth": minor
"@better-auth/core": patch
---

A custom password `verify` function can now return `"success-rehash-needed"` to signal that a password is valid but its stored hash is outdated. When it does, Better Auth re-hashes the password with the configured `hash` function and persists it, allowing transparent migration to a new hashing algorithm or cost factor as users sign in. Re-hashing is opportunistic: a failure to persist the new hash is logged and never blocks an otherwise-valid authentication.

The built-in scrypt verifier is unchanged, so runtime behavior is the same unless you opt in by returning the new value from your own `verify`.

Note: the return type of `ctx.context.password.verify` has widened from `Promise<boolean>` to `Promise<boolean | "success-rehash-needed">`. Code that checks truthiness (`if (result)`) is unaffected. If you call `ctx.context.password.verify` directly, watch for two cases: assigning the result to a `boolean` now raises a type error, and a strict `result === true` comparison will no longer match when the outdated-hash sentinel is returned (this one is not caught by the compiler). Both only apply if you opt in by returning the new value from your own `verify`.
