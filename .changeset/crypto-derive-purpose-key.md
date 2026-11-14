---
"better-auth": minor
---

`better-auth/crypto` now exports `derivePurposeKey`, which derives a separate encryption key from the Better Auth secret for each named purpose and keeps every rotation version. Better Auth packages use it so a ciphertext made for one purpose cannot be decrypted as another.
