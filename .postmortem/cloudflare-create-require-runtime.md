# Postmortem: Cloudflare Workers `createRequire` Runtime Helper

## Issue Reference

* [Issue #9983](https://github.com/better-auth/better-auth/issues/9983)
* [Issue #6690](https://github.com/better-auth/better-auth/issues/6690)
* [Issue #6665](https://github.com/better-auth/better-auth/issues/6665)
* [Issue #6638](https://github.com/better-auth/better-auth/issues/6638)
* [PR #6704](https://github.com/better-auth/better-auth/pull/6704)
* [PR #9657](https://github.com/better-auth/better-auth/pull/9657)

## Summary

`better-auth@1.7.0-beta.4` and `1.7.0-beta.5` reintroduced the Cloudflare
Workers startup crash previously seen in the 1.4.6 release line. The published
`better-auth` package emitted this shared rolldown runtime helper:

```js
import { createRequire } from "node:module";

var __require = /* @__PURE__ */ createRequire(import.meta.url);
```

Cloudflare Workers can leave `import.meta.url` undefined in bundled output, so
the package crashed at module evaluation time before application code ran. The
crash affected unrelated subpaths such as `better-auth/db` because the helper
lived in the shared `_virtual/_rolldown/runtime.mjs` file imported by many
entries, not only by the Node-specific code that needed CommonJS interop.

## Recurrence History

This class of bug has already recurred once:

1. **1.4.6 reports (#6638, #6665, #6690)**: Cloudflare Workers crashed during
   startup because bundled output eagerly called `createRequire(import.meta.url)`.
2. **PR #6704**: Added a Cloudflare smoke test that fails if Wrangler output
   contains `createRequire`, `node:module`, or selected Node-only modules.
3. **PR #9657**: Added `getHttpTestInstance` to `better-auth/test`. The helper
   statically imported `listhen`, which pulled in CommonJS-oriented Node server
   dependencies when the `better-auth` multi-entry package was built.
4. **1.7.0-beta.4 and beta.5**: The published package again contained the eager
   shared rolldown `__require` helper. The existing smoke test did not fail
   because it checked Wrangler's final bundle, not the published package runtime
   helper itself.

## Root Cause

### Test-only dependencies polluted the shared package runtime

`packages/better-auth/src/test-utils/index.ts` statically re-exported
`http-test-instance.ts`, and that file statically imported `listhen`.

Because `better-auth/test` is built as an entry in the same `better-auth`
multi-entry build, rolldown included `listhen` and its transitive dependencies
under `dist/node_modules/`. Some of those dependencies need CommonJS interop, so
rolldown added `__require` to the shared runtime helper.

The helper was shared across unrelated entries. A consumer importing
`better-auth/db` did not import `better-auth/test`, but still evaluated the
same runtime helper and crashed in Workers.

### The existing smoke test checked the wrong boundary

The Cloudflare smoke test checked `e2e/smoke/test/fixtures/cloudflare/dist/index.js`
after Wrangler had bundled and tree-shaken the fixture. That is still useful,
but it did not inspect the built `packages/better-auth/dist/_virtual/_rolldown/runtime.mjs`
file that npm publishes.

The package runtime helper is the earlier contract boundary. Once it contains an
eager `createRequire(import.meta.url)`, any downstream bundler that preserves the
helper can crash even if another fixture bundle happens to tree-shake it away.

## Fix

`getHttpTestInstance` now uses `node:http.createServer()` directly instead of
`listhen`. The helper only needs an OS-assigned local HTTP port and a
promise-returning `close()` method, so the external listener dependency was
unnecessary.

The Cloudflare smoke test now checks two boundaries:

1. Wrangler's final Worker bundle still must not contain `createRequire`,
   `node:fs`, or `node:module`.
2. The built `better-auth` rolldown runtime helper must not contain
   `createRequire`, `node:module`, or `__require`.

## Lesson Learned

1. **Package runtime helpers are part of the edge-runtime contract.** Checking
   only the final app bundle can miss a published-package regression.
2. **A test-only export can poison runtime entries in a multi-entry package.**
   If a subpath is built in the same package, static imports can alter shared
   helpers used by unrelated subpaths.
3. **Do not add external listener/server dependencies to `better-auth/test`
   unless the built package runtime is checked afterward.** Prefer Node built-ins
   for test helpers when they are sufficient.
4. **Generated `dist` can be stale locally.** Rebuild before declaring this class
   fixed or unaffected.

## Prevention

1. Keep the Cloudflare smoke test's direct assertion on
   `packages/better-auth/dist/_virtual/_rolldown/runtime.mjs`.
2. When reviewing changes to `packages/better-auth/src/test-utils`, rebuild
   `better-auth` and scan the generated runtime helper for `createRequire`,
   `node:module`, and `__require`.
3. Reject fixes that only guard `createRequire(import.meta.url)` in generated
   output. The safer fix is to avoid introducing CommonJS interop into the
   shared runtime helper in the first place.
