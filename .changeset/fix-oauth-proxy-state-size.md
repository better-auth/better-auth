---
"better-auth": patch
---

fix(oauth-proxy): produce compact, single-envelope OAuth state parameter to comply with strict provider length limits (e.g. X / Twitter 500-character ceiling)

Replaces redundant double-layer encryption with single-envelope compression (`deflate-raw` with fallback to `node:zlib`) and canonical state packing. This shrinks the state payload from ~1,710 characters down to ~260-310 characters, preventing `invalid_request` state errors on length-restricted providers while maintaining 100% backward compatibility for legacy state packages.
