---
"better-auth": patch
---

When the same device code is approved and denied at the same time, for example from two open approval pages, only the first decision now takes effect, and the other request fails with `invalid_request` and "Device code already processed". Previously, both requests reported success and the later one replaced the first, so a denied device could still receive tokens.

The `/device/approve` error type no longer lists `device_code_already_processed`. The server never returned that code; an already decided code has always returned `invalid_request`. TypeScript code that compares against `device_code_already_processed` must check `invalid_request` instead.
