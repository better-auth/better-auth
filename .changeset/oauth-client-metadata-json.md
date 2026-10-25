---
"@better-auth/oauth-provider": patch
---

Fix OAuth client `metadata` being stored as a JSON string inside a JSON column on adapters with native JSON support, such as Drizzle with Postgres. It is now stored as an object. Clients stored as a string by earlier versions still read correctly.
