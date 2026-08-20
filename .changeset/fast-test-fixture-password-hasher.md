---
"better-auth": patch
---

Test suites using `getTestInstance` now run faster because the shared fixture avoids production password-hashing costs by default. Custom `emailAndPassword.password` implementations continue to take precedence.
