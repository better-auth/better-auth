---
"@better-auth/core": minor
---

PayPal profile types now reflect omitted names, email, and verification claims when personal permissions are not granted. Missing email verification defaults to false; profile mappings must supply an email when the provider omits it.
