---
"auth": patch
---

fix(cli): `auth upgrade` detects renamed packages and replaces `@better-auth/cli` with `auth`

The CLI was renamed from `@better-auth/cli` to `auth` after v1.4.21 and the old name is unmaintained on npm. Projects that still list `@better-auth/cli` (notably those scaffolded by the SvelteKit `sv` add-on) pull in `better-auth@1.4.21` transitively, which drags an old `better-call@1.1.8` into the install tree and silently breaks `@better-auth/core@1.6+` at runtime with `SyntaxError: The requested module 'better-call' does not provide an export named 'kAPIErrorHeaderSymbol'`. `auth upgrade` now detects the stale name and replaces it with `auth` at the current version in the same dependency section. Fixes #9558.
