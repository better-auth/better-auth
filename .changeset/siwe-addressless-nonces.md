---
"better-auth": minor
---

The SIWE plugin now issues nonces before the wallet address or Chain ID is known. `authClient.siwe.nonce()` and `authClient.siwe.getNonce()` no longer accept wallet fields, `getNonce` must return an ERC-4361 nonce (8-250 alphanumeric characters), and SIWE verification now reads the wallet address and Chain ID from the signed ERC-4361 message.
