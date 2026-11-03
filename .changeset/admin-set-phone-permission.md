---
"better-auth": patch
---

`/admin/update-user` now requires the new `user:set-phone` permission to change `phoneNumber` or `phoneNumberVerified`. If you use a custom access control, add `set-phone` to your statements and grant it to roles that should change phone numbers.
