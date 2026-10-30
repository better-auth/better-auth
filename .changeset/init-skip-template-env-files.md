---
"auth": patch
---

`auth init` now writes environment variables only to `.env.local` when it exists, or to `.env` otherwise, so template and environment specific files such as `.env.sample` or `.env.production` no longer receive a generated `BETTER_AUTH_SECRET`. Variables already defined in `.env` or `.env.local`, including ones declared with `export`, are no longer added again.
