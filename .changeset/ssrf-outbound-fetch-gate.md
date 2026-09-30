---
"@better-auth/core": minor
"@better-auth/sso": minor
"@better-auth/electron": minor
"@better-auth/oauth-provider": minor
"better-auth": minor
---

Server-side OAuth and OIDC requests use a shared redirect-refusal policy. SSO and Generic OAuth also check endpoint hosts and DNS answers unless the auth server explicitly approves the origin. Gated hostname requests require working DNS APIs and have a five-second DNS-validation deadline.

Before upgrading, configure server-side endpoints to answer directly and review private SSO and Generic OAuth origins. Approve only exact origins of services you control or independently authorize, and keep the approvals available during initialization and every auth request. Ordinary OAuth Provider remote client JWKS still requires an approved HTTPS origin and a public-looking hostname; discovery-owned resources retain their discovery transport. Back-channel logout retains its public-HTTPS-only policy. Development Electron avatars permit loopback, rather than other private networks.

DNS checks precede the connection and do not pin its destination. Ensure your runtime provides working system lookup or A and AAAA record queries. Missing DNS support now refuses gated hostname requests before HTTP transport, rather than continuing without a DNS check. An unsupported system lookup uses record queries; resolver failures and validation timeouts refuse the request. A DNS-validation deadline is separate from the HTTP timeout.
