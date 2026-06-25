---
"better-auth": patch
"@better-auth/api-key": patch
"@better-auth/core": patch
---

Rate limiting no longer trusts multi-hop `X-Forwarded-For` chains, preventing a client behind an appending proxy from spoofing the leftmost hop to bypass the per-IP rate limit. Single-value IP headers continue to work. To key the real client behind a proxy chain, set `advanced.ipAddress.trustedProxies` to your reverse-proxy IPs or CIDR ranges (the chain is walked right to left, skipping trusted hops), or point `advanced.ipAddress.ipAddressHeaders` at a single trusted client-IP header.
