---
"@better-auth/core": patch
---

Schema mismatch errors from the built-in Kysely adapter now also suggest generating a migration with `npx auth@latest generate` for your own migration tool, such as Wrangler for Cloudflare D1, because `npx auth@latest migrate` cannot reach every database.
