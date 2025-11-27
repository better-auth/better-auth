# Better Auth — Architecture & Plugin Authoring

This document gives you a bird’s‑eye view of how Better Auth is organized, how a request flows through the system, and how to author plugins that extend behavior safely.

---

## 1) Monorepo layout (what lives where)

```text
better-auth/
└─ packages/
   ├─ better-auth/   # Runtime package developers import (handlers, config, plugins)
   ├─ core/          # Shared types, schemas, adapter interfaces, validation utils
   ├─ cli/           # Codegen / developer tooling (e.g., schema generation)
   ├─ expo/          # React Native / Expo bindings
   ├─ passkey/       # WebAuthn / Passkeys support
   ├─ sso/           # SSO integrations (Google, GitHub, etc.)
   ├─ stripe/        # Stripe integration (opt‑in)
   └─ telemetry/     # Anonymous usage metrics (opt‑in, for maintainers)
```

* **`packages/better-auth`** is the entry point users install (`import { betterAuth } from "better-auth"`).
* **`packages/core`** contains the *contract* for database adapters, core types, and shared logic used by runtime packages.
* Adapters (e.g., Prisma/Drizzle) implement the **interfaces** declared in `core` and are consumed by the runtime.

---

## 2) Request lifecycle (data flow)

1. **Initialization** — A developer calls `betterAuth({...options})`. The runtime:

   * merges defaults,
   * validates options,
   * wires in adapters, plugins, and hooks.
2. **Incoming request** — A handler (Next.js Route, Express, Hono, etc.) invokes a runtime API (e.g., `signIn`, `createUser`, `updateUser`).
3. **Pre‑DB work**

   * Input validation & normalization
   * **Hooks (before)** may transform or veto the incoming data
   * Plugins can observe/modify behavior
4. **Database layer** — The runtime calls an adapter method (e.g., `adapter.update({ model: "user", ... })`), which performs I/O.
5. **Post‑DB work**

   * **Hooks (after)** run with the output (e.g., created/updated user)
   * Plugins can react (analytics, emails, auditing)
   * Output is transformed and returned to the caller

> **Tip:** Hooks are synchronous in the lifecycle order (before → adapter → after). Avoid long‑running work in hooks; offload to queues if needed.

---

## 3) Hooks overview

Hooks are optional async callbacks you provide via config that run during lifecycle events.

```ts
import { betterAuth } from "better-auth";

export const auth = betterAuth({
  // ...
  databaseHooks: {
    user: {
      create: {
        before: async (data, req) => {
          // mutate input or throw to block
          return { data: { ...data, displayName: data.name ?? "user" } };
        },
        after: async (user, req) => {
          // side effects, e.g., send welcome email
        }
      },
      update: {
        before: async (partial, req) => {
          // must return { data: ... } — returning undefined keeps original input
          return { data: partial };
        },
        after: async (updated, req) => {
          // audit log, cache invalidation, etc.
        }
      }
    }
  }
});
```

**Contract expectations:**

* `*.before` receives the **input** about to be persisted and should return `{ data: <possibly modified input> }`. If you return `undefined`, the original input is used.
* `*.after` receives the **result** from the database and returns `void` (side‑effects only).

---

## 4) Plugin authoring (how to extend Better Auth)

A plugin is a factory that returns an object with an `id`, optional `config`, and `hooks`. Plugins are registered in `betterAuth({ plugins: [...] })`.

### 4.1 Minimal plugin

```ts
// packages/app/plugins/log-new-users.ts
import type { BetterAuthPlugin } from "better-auth";

export const logNewUsers = (): BetterAuthPlugin => ({
  id: "log-new-users",
  hooks: {
    user: {
      create: {
        after: async (user, req) => {
          console.log("[log-new-users] created:", user.id);
        },
      },
    },
  },
});
```

Register it:

```ts
import { betterAuth } from "better-auth";
import { logNewUsers } from "./plugins/log-new-users";

export const auth = betterAuth({
  // ...your normal config
  plugins: [logNewUsers()],
});
```

### 4.2 Plugin with options & typing

```ts
type AuditPluginOptions = {
  redact?: boolean;
};

export const auditPlugin = (opts: AuditPluginOptions = {}): BetterAuthPlugin => ({
  id: "audit",
  hooks: {
    user: {
      update: {
        after: async (user, req) => {
          const payload = opts.redact ? { id: user.id } : user;
          await fetch(process.env.AUDIT_URL!, {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ event: "user.update", payload }),
          });
        },
      },
    },
  },
});
```

### 4.3 Best practices

* **Stable ID:** give your plugin a unique `id`.
* **Pure config:** avoid mutating external state in the factory.
* **Fast hooks:** keep hooks short; offload heavy work to background jobs.
* **Type‑safe options:** export an options type, validate where needed.
* **Clear errors:** throw with actionable messages if something is misconfigured.

---

## 5) Adapters (how DB I/O happens)

* The runtime calls a **DB adapter** (e.g., Prisma/Drizzle) via the interfaces defined in `packages/core`.
* Each adapter implements a consistent surface: `create`, `findOne`, `findMany`, `update`, `delete`, etc.
* Hooks wrap around adapter calls (`before` → adapter → `after`).

**Why this matters:** your plugins and hooks remain stable across databases — swapping adapters shouldn’t break them.

---

## 6) Error handling

* Throw **typed errors** with clear messages (what’s wrong + how to fix).
* Prefer **fail‑fast** in `before` hooks if input is invalid.
* Log operational errors in `after` hooks (don’t block user flows unless necessary).

---

## 7) Common patterns

* **Deriving fields in `before`** (e.g., `displayName`, `slug`)
* **Auditing in `after`** (e.g., send events to analytics)
* **Policy checks in `before`** (e.g., only admins may update roles)
* **Caching in `after`** (e.g., revalidate tags/keys)

---

## 8) Gotchas

* `*.before` should return `{ data: ... }`. Returning a plain object or `void` may be ignored in future versions; safest is to wrap in `{ data }`.
* Don’t perform long‑running or blocking I/O in `before` that users must wait for; use `after` or queues.
* If your plugin mutates input/output, document it — users should know what changes.

---

## 9) Example end‑to‑end snippet (Express/Hono/Next)

```ts
import { betterAuth } from "better-auth";
import { auditPlugin } from "./plugins/audit";

export const auth = betterAuth({
  // your adapter + session config here
  plugins: [
    auditPlugin({ redact: true }),
  ],
  databaseHooks: {
    user: {
      update: {
        before: async (partial, req) => {
          // enforce displayName formatting
          const name = partial.name?.trim();
          if (name && name.length < 2) {
            throw new Error("Display name must be at least 2 characters.");
          }
          return { data: { ...partial, name } };
        },
      },
    },
  },
});
```

---

## 10) Contributing

For code contributions:

* Keep PRs focused and small.
* Include unit/integration tests where applicable.
* Update docs when behavior or config changes.
* Use conventional commit style (e.g., `docs: ...`, `fix: ...`, `feat: ...`).

Thanks for contributing! 💚
