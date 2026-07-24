---
"better-auth": patch
---

Tighten `x-forwarded-host` validation against RFC 1035 / 3986 / 4291 / 6335 and remove a nested-quantifier hostname regex. Adds an input length cap, strict IPv4 octet (`0-255`) and port (`1-65535`) ranges, structural IPv6 checks (`::` at most once, group count, hex-only digits), and per-label hostname validation.
