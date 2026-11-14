---
"@better-auth/dbsc": minor
---

Add `@better-auth/dbsc`, an experimental plugin for Device Bound Session Credentials. Chrome binds each session to a key held in the device's hardware, and with `enforce: true` a session cookie copied to another device stops working once the short-lived bound cookie expires. Other browsers keep working as before. The plugin adds a `dbscBinding` table, so run `npx auth@latest migrate` or `npx auth@latest generate`.
