---
"auth": patch
---

`auth init` now generates an `app/routes/api.auth.$.ts` resource route that mounts `auth.handler` for Remix and React Router v7 projects, instead of a second auth instance with an unsupported database option.
