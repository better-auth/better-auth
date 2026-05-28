---
"better-auth": patch
---

Surface specific OAuth callback error codes and route every callback failure through one redirect helper.

A failed OAuth sign-in previously gave users almost nothing to act on. The state parser collapsed every failure into a single `please_restart_the_process` code, and the built-in social callback's missing-state branch redirected with a `state` query parameter the error page never reads, so that case showed no error at all. Now `parseState` forwards the precise `StateError` code (`state_not_found`, `state_invalid`, `state_mismatch`, with `state_security_mismatch` reported as `state_mismatch`), and unexpected failures map to `internal_server_error`.

The built-in social callback no longer keeps its own missing-state guard; it goes through the shared state parser like every other callback, so both built-in and generic-OAuth providers report a missing `state` as `error=state_not_found`. All callback error redirects (built-in, generic-OAuth, and oauth-proxy) now use one `redirectOnError` helper that owns the query separator, parameter name, and URL encoding, so a redirect cannot be built with the wrong parameter again.

The `please_restart_the_process` error code is removed. Error pages that branch on `error=please_restart_the_process` should handle the specific state codes (`state_not_found`, `state_invalid`, `state_mismatch`) or `internal_server_error` instead.
