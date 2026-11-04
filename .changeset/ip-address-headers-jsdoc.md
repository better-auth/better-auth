---
"@better-auth/core": patch
---

Editor hints for `advanced.ipAddress.ipAddressHeaders` now show the default, `["x-forwarded-for"]`, and recommend listing only headers your proxy or platform writes. The previous example listed `x-client-ip` first, a header any client can set itself.
