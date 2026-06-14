---
"better-auth": patch
---

/device/token no longer throws exceptions for expected RFC 8628 polling states (authorization_pending, slow_down, expired_token, access_denied). These now return HTTP 400 responses without throwing, eliminating noise in platform error telemetry.