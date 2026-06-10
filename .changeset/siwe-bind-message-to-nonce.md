---
"better-auth": patch
---

Bind the SIWE signed message to server state before creating a session. Previously `/siwe/verify` only checked that a nonce row existed for the wallet address and then delegated entirely to `verifyMessage`. Since the documented `verifyMessage` (viem) performs signature recovery only — without inspecting the message body — a signature the wallet produced for a different message (an earlier nonce, another domain, or arbitrary content) could also satisfy verification against a freshly minted nonce.

The plugin now parses the ERC-4361 message itself and requires its nonce, domain, address, and chain ID to match the server-issued nonce and configured `domain`, and enforces the message's `Expiration Time` / `Not Before` bounds, before verifying the signature. `message` must now be a valid ERC-4361 message (which all standard SIWE clients produce); non-conforming or mismatched messages are rejected with a 401 (`UNAUTHORIZED_SIWE_MESSAGE_MISMATCH`, `UNAUTHORIZED_SIWE_MESSAGE_EXPIRED`, or `UNAUTHORIZED_SIWE_MESSAGE_NOT_YET_VALID`). `verifyMessage` implementations should continue to perform signature recovery only.
