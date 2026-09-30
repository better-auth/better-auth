---
"@better-auth/kysely-adapter": patch
---

Stop queries on Cloudflare D1 from waiting on other requests. With Kysely 0.29, concurrent requests sharing one auth instance on a Workers isolate no longer queue behind each other's queries, which could fail with `Cannot perform I/O on behalf of a different request`. Kysely migrations on D1 now also take a real lock, so two runs at the same time no longer apply the same migration twice.
