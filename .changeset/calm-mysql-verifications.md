---
"better-auth": patch
---

Normalize consumed verification token expiry dates before validation so MySQL/Drizzle rows with string date values remain valid until their actual expiration.
