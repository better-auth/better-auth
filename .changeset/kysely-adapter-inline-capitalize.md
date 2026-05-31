---
"@better-auth/kysely-adapter": patch
---

Drop the `@better-auth/core/utils/string` subpath import from the kysely adapter and inline the tiny `capitalizeFirstLetter` helper instead.

When a stale `@better-auth/cli@1.4.x` is left in a project's dependencies (for example after upgrading `better-auth` without renaming the CLI to `auth`), package managers can hoist the older `@better-auth/core@1.4.x` (which the legacy CLI pins as a regular dependency) to the top of `node_modules`. That older core only declares `./utils` in its `exports` map; it lacks the `./utils/*` wildcard added in 1.5+. Resolving `@better-auth/core/utils/string` from the adapter therefore failed with `ERR_PACKAGE_PATH_NOT_EXPORTED` (Node) or `Module not found: Can't resolve '@better-auth/core/utils/string'` (Webpack/Turbopack). Inlining the helper removes the fragile subpath import so the adapter loads even when an older core is shadowed onto the resolution path.

@see https://github.com/better-auth/better-auth/issues/9767
