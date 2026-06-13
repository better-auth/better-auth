---
"auth": minor
---

The CLI now auto-detects auth configs that export the same instance as both a named export and the default export (e.g. `export const auth = betterAuth(...); export default auth;`). Previously such configs failed when no explicit `--config` path was passed.
