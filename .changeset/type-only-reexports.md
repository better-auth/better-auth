---
"better-auth": patch
---

Type declarations no longer list `zod`, `nanostores`, and `@better-fetch/fetch` re-exports as values, so `import { z } from "better-auth"` now fails type checking instead of crashing at runtime. Import those values from their own packages.
