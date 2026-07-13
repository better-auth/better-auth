---
"auth": patch
---

Recover when `auth generate`'s config imports the not-yet-generated `--output` file (e.g. Convex first-run `import schema from "./schema"`), by stubbing a temporary placeholder and retrying config load.
