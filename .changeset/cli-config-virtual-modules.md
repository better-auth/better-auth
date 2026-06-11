---
"auth": patch
---

Resolve framework virtual-module imports when loading the auth config so the
CLI no longer crashes on them: SvelteKit (`$app/*`, `$env/*`,
`$service-worker`), Vite asset and query imports (`?raw`, `?url`, `?inline`,
`?worker`, `.css`, `.svg`, and other known asset extensions), and Cloudflare
Workers (`cloudflare:workers`). tsconfig `paths` aliases (including SvelteKit's
`$lib` and any `kit.alias`) continue to resolve through the project's tsconfig.
