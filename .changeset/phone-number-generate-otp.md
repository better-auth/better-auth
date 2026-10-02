---
"better-auth": patch
---

The phone number plugin accepts a `generateOTP` option to control the code sent for a given phone number, such as a fixed code for test or app store reviewer accounts. Return `undefined` to keep the default random code.
