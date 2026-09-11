---
"@better-auth/passkey": patch
---

`authClient.signIn.passkey()` now accepts an optional `allowCredentials` array. When provided, the value overrides the server-issued `allowCredentials` list before the WebAuthn ceremony runs, scoping the OS credential picker to specific passkey IDs. Useful for "Continue with Passkey" screens where the relying party already knows which credential the user should sign in with. Default behavior is unchanged when the option is omitted.
