---
"better-auth": patch
---

The organization plugin's `cancelPendingInvitationsOnReInvite` option now actually cancels the prior pending invitation when re-inviting the same email. Previously the option had no effect — re-inviting always failed with `USER_IS_ALREADY_INVITED_TO_THIS_ORGANIZATION`
