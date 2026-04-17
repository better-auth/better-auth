---
"@better-auth/core": patch
"better-auth": patch
"@better-auth/electron": patch
"@better-auth/oauth-provider": patch
---

Consolidate host/IP classification behind `@better-auth/core/utils/host` and close several loopback/SSRF bypasses that the previous per-package regex checks missed.

**Electron user-image proxy: SSRF bypasses closed (`@better-auth/electron`).** `fetchUserImage` previously gated outbound requests with a bespoke IPv4/IPv6 regex that missed multiple vectors. All of the following were reachable in production and are now blocked:

- `http://tenant.localhost/` and other `*.localhost` names (RFC 6761 reserves the entire TLD for loopback).
- `http://[::ffff:169.254.169.254]/` (IPv4-mapped IPv6 to AWS IMDS, the classic SSRF bypass).
- `http://metadata.google.internal/`, `http://metadata.goog/` (GCP instance metadata).
- `http://instance-data/`, `http://instance-data.ec2.internal/` (AWS IMDS alternate FQDNs).
- `http://100.100.100.200/` (Alibaba Cloud IMDS; lives in RFC 6598 shared address space `100.64/10`, which the old regex did not cover).
- `http://0.0.0.0:PORT/` (the Linux/macOS kernel routes the unspecified address to loopback: Oligo's "0.0.0.0 Day").
- `http://[fc00::...]/`, `http://[fd00::...]/` (IPv6 ULA per RFC 4193) and IPv6 link-local `fe80::/10`, neither of which the regex recognized.

Documentation ranges (RFC 5737 / RFC 3849), benchmarking (`198.18/15`), multicast, and broadcast are also now rejected.

**`better-auth`: `0.0.0.0` is no longer treated as loopback.** The previous `isLoopbackHost` implementation in `packages/better-auth/src/utils/url.ts` classified `0.0.0.0` alongside `127.0.0.1` / `::1` / `localhost`. `0.0.0.0` is the unspecified address, not loopback; treating it as such lets browser-origin requests reach localhost-bound dev services (Oligo's "0.0.0.0 Day"). The helper now accepts the full `127.0.0.0/8` range and any `*.localhost` name, and rejects `0.0.0.0`.

**`better-auth`: trusted-origin substring hardening.** `getTrustedOrigins` previously used `host.includes("localhost") || host.includes("127.0.0.1")` when deciding whether to add an `http://` variant for a dynamic `baseURL.allowedHosts` entry. Misconfigurations like `evil-localhost.com` or `127.0.0.1.nip.io` would incorrectly gain an HTTP origin in the trust list. The check now uses the shared classifier, so only real loopback hosts get the HTTP variant.

**`@better-auth/oauth-provider`: RFC 8252 compliance.**

- §7.3 redirect URI matching now accepts the full `127.0.0.0/8` range (not just `127.0.0.1`) plus `[::1]`, with port-flexible comparison. DNS names such as `localhost` are rejected for loopback redirect URIs (§8.3, "NOT RECOMMENDED").
- `validateIssuerUrl` uses the shared loopback check rather than a two-hostname literal comparison.

**New module: `@better-auth/core/utils/host`.** Exposes `classifyHost`, `isLoopbackIP`, `isLoopbackHost`, and `isPublicRoutableHost`. One RFC 6890 / RFC 6761 / RFC 8252 implementation that handles IPv4, IPv6 (including bracketed literals, zone IDs, and IPv4-mapped addresses), and FQDNs, with a curated cloud-metadata FQDN set. All bespoke loopback/private/link-local checks across the monorepo now route through it.
