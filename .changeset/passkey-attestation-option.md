---
"@better-auth/passkey": minor
---

Add an `attestation` option to the passkey plugin that maps to the WebAuthn `AttestationConveyancePreference` IDL (`"none" | "indirect" | "direct" | "enterprise"`). The default remains `"none"`, so existing integrations are unaffected. Set this to `"direct"` or `"enterprise"` to receive an attestation statement from the authenticator — required when verifying hardware-backed passkeys against the FIDO Metadata Service.
