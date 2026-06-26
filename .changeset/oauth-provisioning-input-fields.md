---
"better-auth": patch
---

OAuth sign-up and account-link profile sync now ignore provider profile values for user fields marked `input: false`. Input-allowed additional fields still persist from `mapProfileToUser`, and schema defaults still apply when OAuth creates a user. Apps that used `mapProfileToUser` to fill `input: false` fields should set those fields in server-side provisioning code instead.
