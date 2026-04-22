# @better-auth/core

## 1.7.0-beta.1

## 1.7.0-beta.0

### Minor Changes

- [#8836](https://github.com/better-auth/better-auth/pull/8836) [`93d3871`](https://github.com/better-auth/better-auth/commit/93d3871bd2f7c2fdd423c4c88a22a50b6333e656) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Add `private_key_jwt` (RFC 7523) client authentication across the stack. Servers verify JWT client assertions signed with asymmetric keys; clients sign them for authorization code, refresh, and client credentials flows.

## 1.6.7

### Patch Changes

- [#9211](https://github.com/better-auth/better-auth/pull/9211) [`307196a`](https://github.com/better-auth/better-auth/commit/307196a405e067f4a863de2ed68528e8d4bdc162) Thanks [@stewartjarod](https://github.com/stewartjarod)! - Preserve `Set-Cookie` headers accumulated on `ctx.responseHeaders` when an endpoint throws `APIError`. Cookie side-effects from `deleteSessionCookie` (and any `ctx.setCookie` / `ctx.setHeader` calls before the throw) are no longer silently discarded on the error path.

- [#9281](https://github.com/better-auth/better-auth/pull/9281) [`4a180f0`](https://github.com/better-auth/better-auth/commit/4a180f0b0c084c59e7b006058d3fdbd8542face5) Thanks [@ramonclaudio](https://github.com/ramonclaudio)! - fix(core): serve noop `./instrumentation` on `browser`/`edge` conditions, matching `./async_hooks`

- [#9292](https://github.com/better-auth/better-auth/pull/9292) [`4f373ee`](https://github.com/better-auth/better-auth/commit/4f373eed8a42e02460dbd2ee9973b9493cea04eb) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Accept an array of Client IDs on providers that verify ID tokens by audience (Google, Apple, Microsoft Entra, Facebook, Cognito). The first entry is used for the authorization code flow; all entries are accepted when verifying an ID token's `aud` claim, so a single backend can serve Web, iOS, and Android clients with their platform-specific Client IDs.

  ```ts
  socialProviders: {
    google: {
      clientId: [
        process.env.GOOGLE_WEB_CLIENT_ID!,
        process.env.GOOGLE_IOS_CLIENT_ID!,
        process.env.GOOGLE_ANDROID_CLIENT_ID!,
      ],
      clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
    },
  }
  ```

  Passing a single string keeps working; no migration needed.

  Also exports `getPrimaryClientId` from `@better-auth/core/oauth2` for provider authors: it returns the primary Client ID (the raw string, or the entry at array index 0), paired with `clientSecret` for the authorization code flow. Providers now reject empty arrays, empty strings, and missing config at sign-in time instead of silently producing a malformed authorization URL. Google, Apple, and Facebook require both `clientId` and `clientSecret` because each of those providers mandates a client secret for their server-side code exchange. Microsoft Entra and Cognito only require `clientId`, since both support public-client flows with PKCE alone (no secret).

## 1.6.6

### Patch Changes

- [#9227](https://github.com/better-auth/better-auth/pull/9227) [`b5742f9`](https://github.com/better-auth/better-auth/commit/b5742f9d08d7c6ae0848279b79c8bcc0a09082d7) Thanks [@bytaesu](https://github.com/bytaesu)! - feat(core): add `mapConcurrent` bounded-concurrency utility at `@better-auth/core/utils/async`

- [#9111](https://github.com/better-auth/better-auth/pull/9111) [`a844c7d`](https://github.com/better-auth/better-auth/commit/a844c7dd087715678787cb10bf9670fad46e535b) Thanks [@jonathansamines](https://github.com/jonathansamines)! - `@opentelemetry/api` is now an optional peer dependency

- [#9226](https://github.com/better-auth/better-auth/pull/9226) [`e64ff72`](https://github.com/better-auth/better-auth/commit/e64ff720fb8514cb78aedd1660223d8b948284da) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Consolidate host/IP classification behind `@better-auth/core/utils/host` and close several loopback/SSRF bypasses that the previous per-package regex checks missed.

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
  - §7.3 redirect URI matching now accepts the full `127.0.0.0/8` range (not just `127.0.0.1`) plus `[::1]`, with port-flexible comparison. Port-flexible matching is limited to IP literals; DNS names such as `localhost` continue to use exact-string matching per §8.3 ("NOT RECOMMENDED" for loopback).
  - `validateIssuerUrl` uses the shared loopback check rather than a two-hostname literal comparison.

  **New module: `@better-auth/core/utils/host`.** Exposes `classifyHost`, `isLoopbackIP`, `isLoopbackHost`, and `isPublicRoutableHost`. One RFC 6890 / RFC 6761 / RFC 8252 implementation that handles IPv4, IPv6 (including bracketed literals, zone IDs, IPv4-mapped addresses, and 6to4 / NAT64 / Teredo tunnel forms with embedded-IPv4 recursion), and FQDNs, with a curated cloud-metadata FQDN set. All bespoke loopback/private/link-local checks across the monorepo now route through it.

## 1.6.5

## 1.6.4

## 1.6.3

## 1.6.2

## 1.6.1

## 1.6.0

### Patch Changes

- [#8836](https://github.com/better-auth/better-auth/pull/8836) [`5dd9e44`](https://github.com/better-auth/better-auth/commit/5dd9e44c041839bf269056cb246fd617abe6cd33) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Skip recording redirect APIErrors as span errors in OpenTelemetry traces

## 1.6.0-beta.0

### Patch Changes

- [`28b1291`](https://github.com/better-auth/better-auth/commit/28b1291a86d726b8f2602bf1f4898451cf7c195b) Thanks [@gustavovalverde](https://github.com/gustavovalverde)! - Skip recording redirect APIErrors as span errors in OpenTelemetry traces
