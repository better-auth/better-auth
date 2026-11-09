---
"better-auth": patch
---

Fixed `/admin/create-user` leaving a user without a credential account when the password was rejected (for example by the Have I Been Pwned plugin), which made retrying with the same email fail with `USER_ALREADY_EXISTS_USE_ANOTHER_EMAIL`.
