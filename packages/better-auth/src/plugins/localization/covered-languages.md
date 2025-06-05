## Covered Languages

| Code   | Language        |
|--------|----------------|
| en     | English        |
| ja     | Japanese       |
| fr     | French         |
| de     | German         |
| es     | Spanish        |
| it     | Italian        |
| nl     | Dutch          |
| pl     | Polish         |
| pt     | Portuguese     |
| ru     | Russian        |
| th     | Thai           |
| tr     | Turkish        |
| uk     | Ukrainian      |
| zh-CN  | Chinese (Simplified) |
| zh-TW  | Chinese (Traditional) |
| ko     | Korean         |
| id     | Indonesian     |
| hi     | Hindi          |
| cs     | Czech          |
| ar     | Arabic         |

## Automatically create en.json files
```bash
cd packages/better-auth
pnpm run generate-plugin-locale-enjson
```

## Automatically add added error code translations
Save google-service-account.json to packages/better-auth/src/plugins/localization/ and then,
```bash
cd packages/better-auth
pnpm run translate-plugin-locale-other-language
```

## How to add language

Add XX.json to packages/better-auth/src/locales contents should be 
```
{}
```