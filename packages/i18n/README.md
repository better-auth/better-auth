# Better Auth i18n Plugin

Internationalization plugin for [Better Auth](https://www.better-auth.com) — translate error messages based on the detected locale.

## Installation

```bash
npm install @better-auth/i18n
```

## Built-in translations

The package ships with ready-to-use translations for 22 languages:

| Code | Language  |
|------|-----------|
| `ar` | Arabic |
| `bn` | Bengali |
| `de` | German |
| `en` | English |
| `es` | Spanish |
| `fa` | Persian (Farsi) |
| `fr` | French |
| `hi` | Hindi |
| `id` | Indonesian |
| `it` | Italian |
| `ja` | Japanese |
| `ko` | Korean |
| `nl` | Dutch |
| `pl` | Polish |
| `pt` | Portuguese |
| `ru` | Russian |
| `sv` | Swedish |
| `th` | Thai |
| `tr` | Turkish |
| `uk` | Ukrainian |
| `vi` | Vietnamese |
| `zh` | Chinese (Simplified) |

### Use all built-in locales

```ts
import { betterAuth } from "better-auth";
import { i18n } from "@better-auth/i18n";
import * as locales from "@better-auth/i18n/locales";

export const auth = betterAuth({
  plugins: [
    i18n({ translations: locales }),
  ],
});
```

> [!WARNING]
> Importing from `@better-auth/i18n/locales` directly will bundle all 22 languages. To keep your bundle lean, it is recommended to import individual locales from their specific subpaths.

### Use a subset of locales (Recommended)

To keep your bundle lean and enable tree-shaking, import only the locales you need from their subpath exports:

```ts
import { betterAuth } from "better-auth";
import { i18n } from "@better-auth/i18n";
import { en } from "@better-auth/i18n/locales/en";
import { fr } from "@better-auth/i18n/locales/fr";

export const auth = betterAuth({
  plugins: [
    i18n({
      translations: {
        en,
        fr,
      },
    }),
  ],
});
```

### Override specific messages

```ts
import { betterAuth } from "better-auth";
import { i18n } from "@better-auth/i18n";
import * as locales from "@better-auth/i18n/locales";

export const auth = betterAuth({
  plugins: [
    i18n({
      translations: {
        ...locales,
        fr: {
          ...locales.fr,
          USER_NOT_FOUND: "Membre introuvable",
        },
      },
    }),
  ],
});
```

### Add a custom locale

```ts
import { betterAuth } from "better-auth";
import { i18n } from "@better-auth/i18n";
import * as locales from "@better-auth/i18n/locales";
import type { TranslationDictionary } from "@better-auth/i18n";

const myLocale: TranslationDictionary = {
  USER_NOT_FOUND: "...",
  INVALID_EMAIL_OR_PASSWORD: "...",
  // ... other error codes
};

export const auth = betterAuth({
  plugins: [
    i18n({
      translations: {
        ...locales,
        xx: myLocale,
      },
    }),
  ],
});
```

## Documentation

For full documentation, visit [better-auth.com/docs/plugins/i18n](https://www.better-auth.com/docs/plugins/i18n).

## License

MIT
