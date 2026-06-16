---
"@better-auth/i18n": patch
---

Improved i18n fallback behavior so error messages stay in the built-in English text when no default locale is configured and no English translations are provided, instead of unexpectedly using the first available translation.
