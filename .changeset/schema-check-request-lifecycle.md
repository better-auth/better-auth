---
"@better-auth/core": patch
---

Prevent an interrupted schema validation from leaving subsequent authentication requests hanging. Completed validation results remain cached until a programmatic migration invalidates them.
