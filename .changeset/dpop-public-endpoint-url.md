---
"@better-auth/oauth-provider": patch
---

DPoP token and UserInfo requests now succeed when the server sees a different request URL than the one the client called. This affects deployments behind a proxy that rewrites the host or path, and the Next.js dev server, which reports every request as `localhost`. Before, a client that built the proof's `htu` from the public endpoint URL got `invalid_dpop_proof` for every grant that accepts DPoP.

The expected `htu` is now the public endpoint URL built from `baseURL`, such as `https://auth.example.com/api/auth/oauth2/token`, or the URL of a plugin endpoint that issues tokens. A client that sends proofs to a host other than `baseURL` must build `htu` from the public URL instead. Deployments where the request URL already matches `baseURL` are unaffected.
