---
"better-auth": patch
"auth": patch
---

Fix three correctness bugs (#10252):

- **organization**: `getAdditionalFields()` no longer mutates the shared
  `options.schema.organizationRole.additionalFields` object when building
  partial schemas for `updateOrgRole`. Previously, setting
  `additionalFields[key].required = false` in-place permanently poisoned the
  caller-supplied options, causing any subsequent `organization()` initialization
  that shared the same `additionalFields` reference to build a `createOrgRole`
  schema where all additional fields were treated as optional.

- **one-time-token**: `verifyOneTimeToken` now checks `session.expiresAt` before
  calling `setSessionCookie`. Previously the cookie was written to the response
  context before the expiry guard ran, so callers received a stale session cookie
  even when the endpoint correctly returned a 400 "Session expired" error.

- **cli**: `installDependencies` now uses `bun add` and `yarn add` instead of
  `bun install` and `yarn install`. The `install` sub-commands do not accept
  package-name arguments and would silently ignore the dependencies passed to
  the function.
