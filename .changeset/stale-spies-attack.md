---
"@better-auth/oauth-provider": patch
"better-auth": patch
"@better-auth/passkey": patch
"auth": patch
---

Updated the PostgreSQL Drizzle generator to generate date columns using timezone-aware `timestamp` columns (`withTimezone: true`). This resolves timezone parsing discrepancies and silent hour drifts when clients in different default timezones read and write date records.
