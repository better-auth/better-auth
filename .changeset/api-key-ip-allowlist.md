---
"@better-auth/api-key": minor
---

feat(api-key): per-key IP allowlist

Adds an optional `ipAllowlist` field on API keys. When set to a non-empty
array of IPs or CIDR ranges (IPv4 + IPv6), verification rejects requests
whose client IP is not in the list with a new `IP_NOT_ALLOWED` error. A
rejected request does not consume `remaining`, `requestCount`, or update
`lastRequest`.

The client IP is taken from a new optional `clientIp` field on the verify
body, falling back to the existing `advanced.ipAddress.ipAddressHeaders`
resolution. The check runs inside `validateApiKey`, so the
`enableSessionForAPIKeys` session hook path is also protected.

Migration: adds a nullable `ipAllowlist` column to the `apikey` table.
Existing keys are unaffected (null = no restriction).
