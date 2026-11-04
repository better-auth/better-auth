---
"@better-auth/core": patch
---

Resource servers that set `verifyOptions.typ`, such as `"at+jwt"`, together with `remoteVerify` now accept tokens that introspection reports as active. Previously every token was rejected, because the `typ` check ran against the introspection response, which has no JWT header. The local JWT check still enforces `typ`. That check runs only when `jwksUrl` is set and `remoteVerify.force` is not `true`. Otherwise `typ` is not enforced, and the introspection result alone decides. This also fixes MCP servers that set `jwtVerifyOptions.typ` with `remoteVerify`.
