---
"@better-auth/core": patch
---

Fix `verifyAccessToken` silently dropping the configured audience check during remote introspection. Previously, when a required `audience` was set in `verifyOptions` but the introspection response omitted the `aud` claim, audience validation was skipped and any active token from the issuer was accepted — so a token issued for a different resource or client on the same issuer could also pass verification. Verification now requires the claim: a missing or mismatching `aud` is rejected. Authorization servers that legitimately omit `aud` from introspection responses (it is OPTIONAL per RFC 7662) can opt back into the old behavior with the new `remoteVerify.allowMissingAudience: true` flag, which still rejects mismatching audiences.
