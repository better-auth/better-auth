---
"better-auth": patch
"@better-auth/electron": patch
---

`setRequestCookie` and `applySetCookies` now validate cookie values against the accepted cookie-value character set before writing them into a `Cookie` header, so a value carrying a `;`, `"`, or `\` from an upstream `Set-Cookie` no longer splits into additional cookies or attributes when re-serialized. The Electron client applies the same check when restoring its stored cookies. RFC 6265 §4.1.1 quoted-string values are unquoted before the check.
