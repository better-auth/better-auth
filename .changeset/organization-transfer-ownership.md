---
"better-auth": patch
---

Add `organization.transferOwnership`, a dedicated way to hand an organization to another member. Only a current holder of `creatorRole` can call it, the swap promotes the new owner before demoting the previous one and rolls back if that fails, and concurrent transfers can no longer leave an organization with two owners. Optionally configure `ownershipTransfer.sendTransferOwnershipVerification` to email the current owner a confirmation link first, with `confirmationMode: "explicit"` so link scanners can't apply it.
