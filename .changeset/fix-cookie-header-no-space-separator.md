---
"better-auth": patch
---

`Cookie` headers without a space after `;` separators are now tolerated. Signed-in users behind proxies that strip this space were previously treated as logged-out.
