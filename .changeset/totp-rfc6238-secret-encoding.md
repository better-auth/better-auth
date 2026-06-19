---
"better-auth": patch
---

Add `secretEncoding` option to the TOTP plugin to support RFC 6238-compliant secret handling. When set to `"raw"`, the stored base32 secret is decoded to raw bytes before HMAC key derivation, matching the convention used by Google Authenticator, Authy, Lucia, Auth.js, oslo, otplib, and speakeasy. This unblocks migration of existing TOTP enrollments from RFC-compliant libraries to Better Auth without forced re-enrollment. Default is `"string"` (existing behavior, no breaking change).
