---
"better-auth": patch
---

Optional fields (`required: false`) now accept `null`, not just omission. The
generated input validation previously rejected `null` even though the column is
nullable, so a nullable field could not be cleared by passing `null`.
