---
"@better-auth/sso": patch
---

SSO error redirects merge their parameters into the target URL instead of concatenating them, so a callback or error URL that already carries a query keeps it, values are encoded, and a callback arriving with neither a code nor an error reports a concrete error rather than the literal `undefined`.
