---
"auth": patch
---

Schema generation now uses the better-auth version installed in your project rather than a copy bundled with the CLI. Previously the generated schema could omit columns your installed version requires, and the mismatch only surfaced later as a database error on first sign up instead of as a migration failure.
