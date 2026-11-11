---
"@better-auth/oauth-provider": patch
---

Send a `WWW-Authenticate` challenge on every 401 from `/oauth2/userinfo`. Previously, a DPoP-bound token with a missing or invalid proof, a mismatched `htu` or `htm`, or the wrong authorization scheme got a 401 with no challenge, and so did a request with no access token. A client could not tell from the response which scheme or proof algorithms to retry with.

DPoP-bound tokens and requests that use the `DPoP` scheme now get a `DPoP` challenge with `algs` (RFC 9449 §7.1). Other failures keep the `Bearer` challenge, and a request with no token is offered both schemes. The challenge is also listed in `Access-Control-Expose-Headers`, so browser clients on other origins can read it. Response bodies are unchanged.
