---
"better-auth": patch
---

Add `organization.transferOwnership`, a dedicated way to hand an organization to another member. Only a current holder of `creatorRole` can call it, the new owner is promoted before the previous one is demoted, and a transfer that starts from a stale view of the organization is refused instead of creating a second owner. If the demotion can't be applied, the promotion is rolled back on a best-effort basis. Optionally configure `ownershipTransfer.sendTransferOwnershipVerification` to email the current owner a confirmation link first, with `confirmationMode: "explicit"` so link scanners can't apply it.
