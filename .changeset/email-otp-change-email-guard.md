---
"better-auth": patch
---

The generic email-OTP endpoints refuse `change-email`. A change-email code is keyed by both the current and the new address, which binds it to one target mailbox, so these endpoints previously wrote, returned and validated codes the change-email flow could never read.
