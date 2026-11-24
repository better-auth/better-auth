---
"@better-auth/i18n": patch
---

`@better-auth/i18n` locales now cover the error codes of core and every plugin, and are type-checked against each plugin's `*_ERROR_CODES`. Messages that are not translated yet contain the English text and are marked `TODO: translate`. Each language can also be imported on its own from `@better-auth/i18n/locales/<lang>`.
