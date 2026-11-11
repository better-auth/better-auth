---
"@better-auth/dbsc": minor
---

New `@better-auth/dbsc` plugin binds sessions to the device that signed in, using Device Bound Session Credentials. In Chrome on Windows and macOS, the browser keeps a private key in the device's secure hardware, and Better Auth then accepts the session only with a short-lived cookie that the browser renews by signing with that key. A session cookie copied to another machine, for example by cookie-stealing malware, no longer authenticates there or signs the user out. Other browsers keep ordinary sessions.

Adding the plugin requires a migration for the new `session.dbscPublicKey` field.
