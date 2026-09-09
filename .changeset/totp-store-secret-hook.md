---
"better-auth": minor
---

Add a `totpOptions.storeSecret` hook so the TOTP secret can be encrypted at rest with a custom cipher, such as one backed by a FIPS 140-3 validated module or a KMS/HSM.
