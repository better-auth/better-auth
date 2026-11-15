---
"better-auth": minor
---

A custom device code issuer can now run its own last check before the code is spent, with the newly exported `prepareDeviceCodeRedemption`.

It runs everything `redeemDeviceCode` does that can refuse a poll, then returns a `claim` function instead of claiming the code. Call `claim` once, after your check and before you issue anything. `redeemDeviceCode` behaves as before.
