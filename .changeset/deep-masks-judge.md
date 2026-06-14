---
"better-auth": patch
---

Make the device authorization plugin option schema optional at runtime.

With Zod 4, z.custom(() => true) is treated as required unless optional() is applied, which caused deviceAuthorization without a schema option to throw during initialization. This restores the documented behavior where schema is only needed when customizing plugin tables.
