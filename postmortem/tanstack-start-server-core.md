# Postmortem: TanStack Start Virtual Module Issue

## Issue Reference

* [GitHub Issue #7386][gh-issue]
* [Related TanStack Issue #5795][tanstack-issue]

## Summary

Importing directly from `@tanstack/start-server-core` causes Vite
pre-bundling errors because the package uses virtual modules
(`#tanstack-router-entry`) that require special Vite configuration.

## Root Cause

`@tanstack/start-server-core` is an internal TanStack package that has
its own Vite configuration with external dependencies like
`#tanstack-router-entry`.
When better-auth’s tanstack-start integration imported directly from
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

Import from the framework-specific server packages instead, which
properly re-export everything from `@tanstack/start-server-core`:

* For React: Use `@tanstack/react-start-server`
* For Solid.js: Use `@tanstack/solid-start-server`

```ts
// GOOD - For React
import { setCookie } from "@tanstack/react-start-server";

// GOOD - For Solid.js
import { setCookie } from "@tanstack/solid-start-server";
```

## Lesson Learned

When integrating with TanStack Start:

1. **Never import directly from `@tanstack/start-server-core`** -
   it’s an internal package with virtual modules
2. **Use framework-specific packages** -
   `@tanstack/react-start-server` for React,
   `@tanstack/solid-start-server` for Solid.js
3. **These packages re-export the same APIs** -
   so `setCookie`, `getCookie`, etc. are available from both

## Files Changed in Fix

* `packages/better-auth/src/integrations/tanstack-start.ts` -
  Changed import to `@tanstack/react-start-server`
* `packages/better-auth/src/integrations/tanstack-start-solid.ts` -
  New file using `@tanstack/solid-start-server`
* `packages/better-auth/package.json` -
  Updated peer dependencies and exports
* `packages/better-auth/tsdown.config.ts` -
  Added new build entry
* `docs/content/docs/integrations/tanstack.mdx` -
  Updated documentation
* `docs/content/docs/installation.mdx` -
  Updated documentation

[gh-issue]: https://github.com/better-auth/better-auth/issues/7386

[tanstack-issue]: https://github.com/TanStack/router/issues/5795
