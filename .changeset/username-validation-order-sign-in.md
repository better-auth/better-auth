---
"better-auth": patch
---

With the username plugin's `validationOrder.username` set to `"post-normalization"`, users can now sign in with the username they signed up with, and `isUsernameAvailable` checks the normalized name. Before, a name like "Test Username" was accepted at sign-up but rejected as invalid at sign-in. Setting it to `"pre-normalization"` now checks the name as typed at sign-in, the same as the default.
