---
"better-auth": patch
---

Fixed `/admin/create-user` leaving a user without a credential account when creating that account failed, which made retrying with the same email fail with `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`.
