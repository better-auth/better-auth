---
"@better-auth/core": patch
---

fix(core): use package imports map for internal async_hooks reference

Four internal modules under `packages/core/src/context/` imported the package's own subpath via `@better-auth/core/async_hooks`. Self-referential subpath resolution breaks under content-addressed install layouts (notably Bun's production install mode, used by Vercel's native Bun runtime), surfacing as `TypeError: Requested module is not instantiated yet` on Vercel or `Cannot find module '@better-auth/core/async_hooks'` on a plain Bun prod install. Switched those four imports to `#async_hooks` and added a matching `imports` map to `packages/core/package.json` that mirrors the conditions of the public `./async_hooks` export. No change for downstream consumers.
