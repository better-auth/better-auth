---
"better-auth": patch
---

Widen the `@sveltejs/kit` peer dependency range to `^2.0.0 || ^3.0.0-0` so installing Better Auth alongside a SvelteKit 3 prerelease no longer requires `--legacy-peer-deps`. The SvelteKit integration only relies on `RequestEvent` and `cookies.set`, which are unchanged in Kit 3's public API.
