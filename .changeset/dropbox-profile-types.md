---
"@better-auth/core": minor
---

**Breaking:** Dropbox profile mappings now use the current-account fields, including account status, locale, account type, nullable team data, and tagged root information. Custom profiles must supply the required fields, including the home path for team roots, and handle an omitted profile photo.
