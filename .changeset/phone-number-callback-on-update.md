---
"better-auth": patch
---

Fire `callbackOnVerification` when a phone number is verified with `updatePhoneNumber: true`. The callback previously only ran on initial verification, so consumers relying on it (e.g. to sync verified numbers to an external system) would miss the event when an authenticated user changed their number.
