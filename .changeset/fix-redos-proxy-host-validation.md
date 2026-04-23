---
"better-auth": patch
---

fix(security): remove ReDoS-prone regex from `x-forwarded-host` validation

`validateProxyHeader` previously used a hostname regex with nested quantifiers (`([a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?` repeated under an outer group). On JS engines without v8's regex hardening, a crafted `x-forwarded-host` value could trigger catastrophic backtracking and exhaust CPU. Replaced the hostname/IPv6 regex paths with a linear split-and-validate-per-label parser; behavior is unchanged for valid input. Reported by PatchPilots in #8898.
