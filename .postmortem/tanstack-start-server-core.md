# Postmortem: TanStack Start Virtual Module Issue

## Issue Reference

* [GitHub Issue #7386][gh-issue]
* [Related TanStack Issue #5795][tanstack-issue]

## Summary

Importing directly from `@tanstack/start-server-core` causes Vite
pre-bundling errors because the package uses virtual modules
(`#tanstack-router-entry`) that require special Vite configuration.

## Recurrence History

This issue has resurfaced multiple times, caused by PRs attempting to
support both Solid and React versions of TanStack Start:

1. [PR #6045](https://github.com/better-auth/better-auth/pull/6045)
2. [PR #6235](https://github.com/better-auth/better-auth/pull/6235)
3. [PR #7340](https://github.com/better-auth/better-auth/pull/7340)
   (v1.4.12 -> v1.4.13)

The initial fix in v1.4.14 using `@tanstack/react-start-server` and
`@tanstack/solid-start-server` did not resolve the issue.

## Root Cause

`@tanstack/start-server-core` is an internal TanStack package that has
its own Vite configuration with external dependencies like
`#tanstack-router-entry`.
When better-auth tanstack-start integration imported directly from
this package:

```ts
// BAD - Don't do this
import { setCookie } from "@tanstack/start-server-core";
```

Vite tried to pre-bundle `@tanstack/start-server-core` and encountered
the virtual modules, causing the error:

```text
Could not resolve "#tanstack-router-entry"
```

## Solution

Import from the framework-specific server subpath instead, which
properly re-export everything from `@tanstack/start-server-core`:

* For React: Use `@tanstack/react-start/server`
* For Solid.js: Use `@tanstack/solid-start/server`

```ts
// GOOD - For React
import { setCookie } from "@tanstack/react-start/server";

// GOOD - For Solid.js
import { setCookie } from "@tanstack/solid-start/server";
```

**Note:** The separate packages `@tanstack/react-start-server` and
`@tanstack/solid-start-server` did NOT fix the issue.
You must use the `/server` subpath from the main packages.

## User Workaround

If users encounter this issue before an official fix is released,
they can add the following to their `vite.config.ts`:

```ts
optimizeDeps: {
  exclude: ['@tanstack/start-server-core'],
},
```

## Lesson Learned

When integrating with TanStack Start:

1. **Never import directly from `@tanstack/start-server-core`** -
   this is an internal package with virtual modules
2. **Use framework-specific subpaths** -
   `@tanstack/react-start/server` for React,
   `@tanstack/solid-start/server` for Solid.js
3. **Do not use separate `-server` packages** -
   `@tanstack/react-start-server` does NOT fix the issue
4. **These packages re-export the same APIs** -
   so `setCookie`, `getCookie`, etc. are available from both

## Files Changed in Fix

* `packages/better-auth/src/integrations/tanstack-start.ts` -
  Changed import to `@tanstack/react-start/server`
* `packages/better-auth/src/integrations/tanstack-start-solid.ts` -
  Changed import to `@tanstack/solid-start/server`
* `packages/better-auth/package.json` -
  Updated peer dependencies from `@tanstack/*-start-server` to
  `@tanstack/*-start`

[gh-issue]: https://github.com/better-auth/better-auth/issues/7386

[tanstack-issue]: https://github.com/TanStack/router/issues/5795
