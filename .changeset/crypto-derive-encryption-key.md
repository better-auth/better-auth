---
"better-auth": minor
---

Plugins can now derive a separate encryption key for each value they encrypt with `deriveEncryptionKey(secret, purpose)` from `better-auth/crypto`, so a ciphertext made for one purpose cannot be decrypted as another. Pass the result as `key` to `symmetricEncrypt` and `symmetricDecrypt`. Rotated secret versions are kept.
