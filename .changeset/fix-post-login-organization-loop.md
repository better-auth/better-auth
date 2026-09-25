---
"@better-auth/oauth-provider": patch
---

Add `isContinue` to `postLogin.shouldRedirect` so organization selectors can validate the selected organization on continuation without repeatedly showing the selection page. Update the multi-organization example while preserving server-side selection checks.
