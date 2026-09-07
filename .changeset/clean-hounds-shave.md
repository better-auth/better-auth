---
"better-auth": patch
---

fix(deps): remove the unused `better-sqlite3` peer and allow vitest 5

`peerDependenciesMeta.optional` silences only a MISSING peer — npm still fails
`ERESOLVE` on a version MISMATCH, so these two entries blocked installs for
consumers who never import the relevant entry point.

- `better-sqlite3` is not referenced anywhere in `packages/better-auth` (no
  source import, not a devDependency); the peer is removed. It was the only
  peer declaration of it in the repo — `cli` and `electron` take it as a
  devDependency, which is unaffected.
- `vitest` is genuinely imported by `src/test-utils/test-instance.ts`, so the
  peer stays — its range now includes `^5.0.0`.
