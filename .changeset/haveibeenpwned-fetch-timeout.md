---
"better-auth": patch
---

The HaveIBeenPwned password check now aborts its request to the range API after 5 seconds, so an unresponsive upstream no longer stalls sign-up and password reset.
