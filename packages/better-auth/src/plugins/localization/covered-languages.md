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

## Automatically create en.json files from $BASSE_ERROR_CODES and $ERROR_CODES from plugins by script
```bash
cd packages/better-auth
pnpm run generate-plugin-locale-enjson
```

## Automatically add error code translations by json-autotranslate to json of other Languages
Save google-service-account.json to packages/better-auth/src/plugins/localization/ and then do as follows
```bash
cd packages/better-auth
pnpm run translate-plugin-locale-other-language
```

## How to add language

Add XX.json to packages/better-auth/src/locales contents should be 
```
{}
```