---
title: Telemetry
description: Better Auth now collects anonymous telemetry data about general usage.
---

Better Auth collects anonymous usage data to help us improve the project. This is optional, transparent, and disabled by default.

## Why is telemetry collected?

Since v1.3.5, Better Auth collects anonymous telemetry data about general usage if enabled.

Telemetry data helps us understand how Better Auth is being used across different environments so we can improve performance, prioritize features, and fix issues more effectively. It guides our decisions on performance optimizations, feature development, and bug fixes. All data is collected completely anonymously and with privacy in mind, and users can opt out at any time. We strive to keep what we collect as transparent as possible.

## What is being collected?

The following data points may be reported. Everything is anonymous and intended for aggregate insights only.

- **Anonymous identifier**: A non-reversible hash derived from your project (`package.json` name and optionally `baseURL`). This lets us de‑duplicate events per project without knowing who you are.
- **Runtime**: `{ name: "node" | "bun" | "deno", version }`.
- **Environment**: one of `development`, `production`, `test`, or `ci`.
- **Framework (if detected)**: `{ name, version }` for frameworks like Next.js, Nuxt, Remix, Astro, SvelteKit, etc.
- **Database (if detected)**: `{ name, version }` for integrations like PostgreSQL, MySQL, SQLite, Prisma, Drizzle, MongoDB, etc.
- **System info**: platform, OS release, architecture, CPU count/model/speed, total memory, and flags like `isDocker`, `isWSL`, `isTTY`.
- **Package manager**: `{ name, version }` derived from the npm user agent.
- **Redacted auth config snapshot**: A minimized, privacy‑preserving view of your `betterAuth` options produced by `getTelemetryAuthConfig`.

We also collect anonymous telemetry from the CLI:

- **CLI generate (`cli_generate`)**: outcome `generated | overwritten | appended | no_changes | aborted` plus redacted config.
- **CLI migrate (`cli_migrate`)**: outcome `migrated | no_changes | aborted | unsupported_adapter` plus adapter id (when relevant) and redacted config.


<Callout type="info">
  You can audit telemetry locally by setting the `BETTER_AUTH_TELEMETRY_DEBUG=1` environment variable when running your project or by setting `telemetry: { debug: true }` in your auth config. In this debug mode, telemetry events are logged only to the console.

  ```ts title="auth.ts"
  export const auth = betterAuth({
    // [!code highlight]
    telemetry: { // [!code highlight]
      debug: true // [!code highlight]
    } // [!code highlight]
  });
  ```
</Callout>

## How is my data protected?

All collected data is fully anonymous and only useful in aggregate. It cannot be traced back to any individual source and is accessible only to a small group of core Better Auth maintainers to guide roadmap decisions.

- **No PII or secrets**: We do not collect emails, usernames, tokens, secrets, client IDs, client secrets, or database URLs.
- **No full config**: We never send your full `betterAuth` configuration. Instead we send a reduced, redacted snapshot of non‑sensitive toggles and counts.
- **Redaction by design**: See [detect-auth-config.ts](https://github.com/better-auth/better-auth/blob/main/packages/better-auth/src/telemetry/detectors/detect-auth-config.ts) in the Better Auth source for the exact shape of what is included. It purposely converts sensitive values to booleans, counts, or generic identifiers.

## How can I enable it?

You can enable telemetry collection in your auth config or by setting an environment variable.

- Via your auth config.

  ```ts title="auth.ts"
  export const auth = betterAuth({
    // [!code highlight]
    telemetry: { // [!code highlight]
      enabled: true// [!code highlight]
    } // [!code highlight]
  });
  ```

- Via an environment variable.

  ```txt title=".env"
  # Enable telemetry
  BETTER_AUTH_TELEMETRY=1

  # Disable telemetry
  BETTER_AUTH_TELEMETRY=0
  ```


### When is telemetry sent?

- On `betterAuth` initialization (`type: "init"`).
- On CLI actions: `generate` and `migrate` as described above.

Telemetry is disabled automatically in tests (`NODE_ENV=test`) unless explicitly overridden by internal tooling.
