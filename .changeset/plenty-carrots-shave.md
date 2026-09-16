---
"better-auth": patch
---

captcha: allow a custom fetch implementation for the siteverify call

`captcha()` now accepts `customFetchImpl`, forwarded to the `betterFetch` call
every verify handler already makes. `siteVerifyURLOverride` can only point that
call at a different URL, so verification always went through the global fetch;
this lets a host answer it without a network round trip at all.

The case that motivated it: a Cloudflare Workers deployment running the plugin
locally with Cloudflare's always-pass Turnstile test secret. The verification
answer is a foregone conclusion there, but the gate is fail-closed, so any
transport failure turns a sign-in into a 500 — including loopback HTTP, where
workerd's 5s idle keep-alive close raced roughly 2% of sign-ins. An injected
fetch resolves verification in process while every other part of the gate — the
endpoint match, the missing-token 400, the fail-closed catch — still runs.

Also useful for testing the gate without a network mock, and for runtimes whose
outbound transport is not the global fetch.
