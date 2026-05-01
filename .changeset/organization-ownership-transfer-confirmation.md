---
"better-auth": minor
---

Add email confirmation flow for organization ownership transfers. When `sendTransferOwnershipEmail` is configured, the new owner receives an email with a confirmation link before the transfer is completed. A `requirePasswordToTransferOwnership` option is also available to require the current owner to verify their password before initiating a transfer.
