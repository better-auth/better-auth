---
"better-auth": patch
"@better-auth/electron": patch
---

Cookie values containing characters outside the bare cookie-octet range (such as `;`, `"`, or `\`) are now percent-encoded into the `Cookie` header. They were previously dropped on re-serialization, which could break flows that store structured values in cookies.
