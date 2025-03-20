# Contributing to Better Auth

Thanks for taking the time to improve Better Auth! This is a small document to get you started.

Please refer to the [getting-started documentation](https://better-auth.com/docs/contribute/getting-started) specific to contributing for more information.

## Security Issues

If you see any security issue we prefer you to disclose it via an email (security@better-auth.com). All reports will be promptly addressed, and you'll be credited accordingly.

Learn more about our [security issues documentation](https://better-auth.com/docs/contribute/security-issues).

## A Few Guidelines to keep in mind

- Rather than extensive configurations, focus instead on providing opinionated, best-practice defaults.
- Try to make a consistent and predictable API across all supported frameworks
- Everything should be type-safe and embrace typescript magic when necessary.

## Development

Read more about development in the [getting-started documentation](https://better-auth.com/docs/contribute/getting-started#development-setup).

1. Fork the repo
2. clone your fork.
3. install node.js (preferable latest LTS).
4. run `cp -n ./docs/.env.example ./docs/.env` to create a `.env` file (if it doesn't exist)
5. run `pnpm i` in your terminal to install dependencies.
6. create a branch.
7. build the project using `pnpm build`
8. run `pnpm -F docs dev` (to run the docs section)
9. create a draft pull request. link the relevant issue by referring to it in the PR's description. Eg.closes #123 will link the PR to issue/pull request #123.
10. implement your changes.

## Testing

Read more about testing in the [testing guide](https://better-auth.com/docs/contribute/testing).


## Architecture

```mermaid
graph TD
    Request["Incoming HTTP Request"]:::api

    subgraph "External API Interface"
        AR["Authentication Routes"]:::api
    end

    subgraph "Middlewares"
        OC["Origin Check Middleware"]:::api
        RL["Rate Limiter Middleware"]:::api
        OC --> RL
    end

    subgraph "Core Library"
        Core["Core Authentication Engine"]:::core
    end

    subgraph "Persistence / Adapters"
        Drizzle["Drizzle Adapter"]:::adapter
        Kysely["Kysely Adapter"]:::adapter
        Memory["Memory Adapter"]:::adapter
        MongoDB["MongoDB Adapter"]:::adapter
        Prisma["Prisma Adapter"]:::adapter
    end

    Plugins["Plugin Ecosystem"]:::plugin

    Request --> AR
    AR --> OC
    RL --> Core
    Core --> Drizzle
    Core --> Kysely
    Core --> Memory
    Core --> MongoDB
    Core --> Prisma
    Core --> Plugins

    click AR "https://github.com/better-auth/better-auth/tree/main/packages/better-auth/src/api/routes"
    click OC "https://github.com/better-auth/better-auth/blob/main/packages/better-auth/src/api/middlewares/origin-check.ts"
    click RL "https://github.com/better-auth/better-auth/tree/main/packages/better-auth/src/api/rate-limiter"
    click Core "https://github.com/better-auth/better-auth/blob/main/packages/better-auth/src/auth.ts"
    click Core "https://github.com/better-auth/better-auth/blob/main/packages/better-auth/src/index.ts"
    click Drizzle "https://github.com/better-auth/better-auth/tree/main/packages/better-auth/src/adapters/drizzle-adapter"
    click Kysely "https://github.com/better-auth/better-auth/tree/main/packages/better-auth/src/adapters/kysely-adapter"
    click Memory "https://github.com/better-auth/better-auth/tree/main/packages/better-auth/src/adapters/memory-adapter"
    click MongoDB "https://github.com/better-auth/better-auth/tree/main/packages/better-auth/src/adapters/mongodb-adapter"
    click Prisma "https://github.com/better-auth/better-auth/tree/main/packages/better-auth/src/adapters/prisma-adapter"
    click Plugins "https://github.com/better-auth/better-auth/tree/main/packages/better-auth/src/plugins"

    classDef api fill:#ADD8E6,stroke:#000,stroke-width:2px;
    classDef core fill:#90EE90,stroke:#000,stroke-width:2px;
    classDef adapter fill:#FFD700,stroke:#000,stroke-width:2px;
    classDef plugin fill:#DA70D6,stroke:#000,stroke-width:2px;
```
