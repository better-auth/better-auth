---
"better-auth": minor
---

Refactored email validation on sign-up and email change endpoints to return a localized, single error payload rather than a schema-level validation array.

* **Specific Error Codes:** Invalid email inputs now throw `INVALID_EMAIL` instead of a generic `VALIDATION_ERROR`, enabling frontend applications to display specific, translatable error messages.
* **Sequential Validation:** Request bodies now accept valid strings at the schema level and perform validation logic sequentially in the handler, returning errors one at a time.