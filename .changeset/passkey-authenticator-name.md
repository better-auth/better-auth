---
"@better-auth/passkey": patch
---

Resolve a friendly label for a passkey from the authenticator that created it. Passkeys already store the authenticator `aaguid`; the plugin now exports `getAuthenticatorName(aaguid)` and an extensible `commonAuthenticatorNames` map so you can show a provider name (for example "1Password" or "Google Password Manager") when rendering passkeys, with full coverage available through the community AAGUID source. To set a server-side default, `registration.afterVerification` can now return a `name` used when the client supplies none. Passkey names are trimmed on registration and update.
