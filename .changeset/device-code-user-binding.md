---
"better-auth": patch
---

The device authorization plugin now accepts an optional `user_id` when issuing a device code via `/device/code`, pre-binding the code to that user. Only the bound user can approve or deny the code, so a publicly visible user code can no longer be claimed by someone else.
