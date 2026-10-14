---
"better-auth": patch
---

fix(admin): propagate client-defined `additionalFields` to admin plugin endpoints (e.g. `listUsers`, `getUser`) by introducing a generic, opt-in `inferAdditionalFields` metadata type-refinement helper in the core client.
