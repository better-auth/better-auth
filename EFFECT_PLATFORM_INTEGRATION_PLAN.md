# Effect/Platform Native Integration Plan for Better-Auth

## Executive Summary

This plan outlines creating an **Effect-native** integration for Better-Auth with Effect/Platform. The goal is to allow users to use Better-Auth in a fully Effect-native way - where all auth operations return `Effect`s, use Effect's dependency injection (Context/Layer), and integrate seamlessly with Effect/Platform's HttpApi builder.

## Related Issues

- **Issue #7234**: Drizzle Adapter breaks with Effect-based execution model
- Maintainers (@bytaesu, @ping-maxwell) are considering Effect support

## Architecture Overview

### New Package: `@better-auth/effect`

A dedicated package that provides:

1. **Effect-wrapped Auth API** - All operations return `Effect`s with typed errors
2. **Service Tags** - `BetterAuth`, `CurrentUser`, `CurrentSession` for DI
3. **HttpApi Integration** - Middleware, security, and endpoint helpers
4. **Error Types** - Effect Schema-based error types

```
packages/
├── effect/                     # New package: @better-auth/effect
│   ├── src/
│   │   ├── index.ts
│   │   ├── BetterAuth.ts       # Main service
│   │   ├── Session.ts          # Session context
│   │   ├── Errors.ts           # Typed errors
│   │   ├── HttpApi.ts          # HttpApi integration
│   │   └── Middleware.ts       # Auth middleware
│   ├── package.json
│   └── tsconfig.json
```

## Detailed Implementation

### 1. Error Types (`Errors.ts`)

```typescript
import { Schema } from "effect"
import { HttpApiSchema } from "@effect/platform"

// Base auth error
export class AuthError extends Schema.TaggedError<AuthError>()(
  "AuthError",
  {
    message: Schema.String,
    code: Schema.String,
  }
) {}

// Unauthorized - 401
export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  "Unauthorized",
  {
    message: Schema.String,
  },
  HttpApiSchema.annotations({ status: 401 })
) {}

// Forbidden - 403
export class Forbidden extends Schema.TaggedError<Forbidden>()(
  "Forbidden",
  {
    message: Schema.String,
    code: Schema.optional(Schema.String),
  },
  HttpApiSchema.annotations({ status: 403 })
) {}

// Session expired - 401
export class SessionExpired extends Schema.TaggedError<SessionExpired>()(
  "SessionExpired",
  {
    message: Schema.String,
  },
  HttpApiSchema.annotations({ status: 401 })
) {}

// Invalid credentials - 401
export class InvalidCredentials extends Schema.TaggedError<InvalidCredentials>()(
  "InvalidCredentials",
  {
    message: Schema.String,
  },
  HttpApiSchema.annotations({ status: 401 })
) {}

// User not found - 404
export class UserNotFound extends Schema.TaggedError<UserNotFound>()(
  "UserNotFound",
  {
    message: Schema.String,
  },
  HttpApiSchema.annotations({ status: 404 })
) {}

// Email already exists - 409
export class EmailAlreadyExists extends Schema.TaggedError<EmailAlreadyExists>()(
  "EmailAlreadyExists",
  {
    message: Schema.String,
  },
  HttpApiSchema.annotations({ status: 409 })
) {}

// Rate limited - 429
export class RateLimited extends Schema.TaggedError<RateLimited>()(
  "RateLimited",
  {
    message: Schema.String,
    retryAfter: Schema.optional(Schema.Number),
  },
  HttpApiSchema.annotations({ status: 429 })
) {}
```

### 2. Session Context (`Session.ts`)

```typescript
import { Context, Effect, Layer } from "effect"
import type { Auth } from "better-auth"

// Infer types from auth instance
export type InferUser<A extends Auth<any>> = A["$Infer"]["Session"]["user"]
export type InferSession<A extends Auth<any>> = A["$Infer"]["Session"]["session"]

// Create typed session context for a specific auth instance
export const makeSessionContext = <A extends Auth<any>>() => {
  class CurrentUser extends Context.Tag("@better-auth/effect/CurrentUser")<
    CurrentUser,
    InferUser<A>
  >() {}

  class CurrentSession extends Context.Tag("@better-auth/effect/CurrentSession")<
    CurrentSession,
    InferSession<A>
  >() {}

  // Combined session data
  class AuthSession extends Context.Tag("@better-auth/effect/AuthSession")<
    AuthSession,
    {
      readonly user: InferUser<A>
      readonly session: InferSession<A>
    }
  >() {}

  return { CurrentUser, CurrentSession, AuthSession }
}

// Default exports for simple usage
export class CurrentUser extends Context.Tag("@better-auth/effect/CurrentUser")<
  CurrentUser,
  Record<string, any>
>() {}

export class CurrentSession extends Context.Tag("@better-auth/effect/CurrentSession")<
  CurrentSession,
  Record<string, any>
>() {}
```

### 3. Main BetterAuth Service (`BetterAuth.ts`)

```typescript
import { Context, Effect, Layer, pipe } from "effect"
import type { Auth, BetterAuthOptions } from "better-auth"
import { betterAuth } from "better-auth"
import * as Errors from "./Errors"

// The BetterAuth service interface
export interface BetterAuthService<A extends Auth<any> = Auth<any>> {
  readonly auth: A
  
  // Session operations
  readonly getSession: (
    headers: Headers
  ) => Effect.Effect<
    { user: A["$Infer"]["Session"]["user"]; session: A["$Infer"]["Session"]["session"] },
    Errors.Unauthorized
  >
  
  // Sign in
  readonly signInEmail: (params: {
    email: string
    password: string
    rememberMe?: boolean
  }) => Effect.Effect<
    { user: A["$Infer"]["Session"]["user"]; session: A["$Infer"]["Session"]["session"] },
    Errors.InvalidCredentials | Errors.UserNotFound | Errors.RateLimited
  >
  
  // Sign up
  readonly signUpEmail: (params: {
    email: string
    password: string
    name: string
  }) => Effect.Effect<
    { user: A["$Infer"]["Session"]["user"]; session: A["$Infer"]["Session"]["session"] },
    Errors.EmailAlreadyExists | Errors.RateLimited
  >
  
  // Sign out
  readonly signOut: (
    headers: Headers
  ) => Effect.Effect<void, Errors.Unauthorized>
  
  // List sessions
  readonly listSessions: (
    headers: Headers
  ) => Effect.Effect<
    Array<A["$Infer"]["Session"]["session"]>,
    Errors.Unauthorized
  >
  
  // Revoke session
  readonly revokeSession: (
    token: string,
    headers: Headers
  ) => Effect.Effect<void, Errors.Unauthorized>
  
  // Handler for mounting
  readonly handler: (request: Request) => Promise<Response>
}

// Service Tag
export class BetterAuth extends Context.Tag("@better-auth/effect/BetterAuth")<
  BetterAuth,
  BetterAuthService
>() {}

// Create the service implementation
export const make = <Options extends BetterAuthOptions>(
  options: Options
): Effect.Effect<BetterAuthService<Auth<Options>>> =>
  Effect.sync(() => {
    const auth = betterAuth(options)
    
    const mapApiError = (error: any) => {
      const code = error?.code || error?.body?.code || "UNKNOWN"
      const message = error?.message || error?.body?.message || "An error occurred"
      
      switch (code) {
        case "UNAUTHORIZED":
        case "INVALID_SESSION":
          return new Errors.Unauthorized({ message })
        case "INVALID_CREDENTIALS":
          return new Errors.InvalidCredentials({ message })
        case "USER_NOT_FOUND":
          return new Errors.UserNotFound({ message })
        case "EMAIL_ALREADY_EXISTS":
        case "USER_ALREADY_EXISTS":
          return new Errors.EmailAlreadyExists({ message })
        case "RATE_LIMIT_EXCEEDED":
          return new Errors.RateLimited({ message })
        case "SESSION_EXPIRED":
          return new Errors.SessionExpired({ message })
        case "FORBIDDEN":
          return new Errors.Forbidden({ message, code })
        default:
          return new Errors.AuthError({ message, code })
      }
    }
    
    return {
      auth,
      
      getSession: (headers: Headers) =>
        Effect.tryPromise({
          try: () => auth.api.getSession({ headers }),
          catch: mapApiError,
        }).pipe(
          Effect.flatMap((session) =>
            session
              ? Effect.succeed(session)
              : Effect.fail(new Errors.Unauthorized({ message: "No session found" }))
          )
        ),
      
      signInEmail: (params) =>
        Effect.tryPromise({
          try: () =>
            auth.api.signInEmail({
              body: params,
            }),
          catch: mapApiError,
        }),
      
      signUpEmail: (params) =>
        Effect.tryPromise({
          try: () =>
            auth.api.signUpEmail({
              body: params,
            }),
          catch: mapApiError,
        }),
      
      signOut: (headers: Headers) =>
        Effect.tryPromise({
          try: () => auth.api.signOut({ headers }),
          catch: mapApiError,
        }).pipe(Effect.asVoid),
      
      listSessions: (headers: Headers) =>
        Effect.tryPromise({
          try: () => auth.api.listSessions({ headers }),
          catch: mapApiError,
        }),
      
      revokeSession: (token: string, headers: Headers) =>
        Effect.tryPromise({
          try: () =>
            auth.api.revokeSession({
              headers,
              body: { token },
            }),
          catch: mapApiError,
        }).pipe(Effect.asVoid),
      
      handler: auth.handler,
    } as BetterAuthService<Auth<Options>>
  })

// Layer constructor
export const layer = <Options extends BetterAuthOptions>(
  options: Options
): Layer.Layer<BetterAuth> =>
  Layer.effect(BetterAuth, make(options))
```

### 4. HttpApi Integration (`HttpApi.ts`)

```typescript
import { Context, Effect, Layer, Schema } from "effect"
import {
  HttpApiMiddleware,
  HttpApiSecurity,
  HttpServerRequest,
  HttpApp,
  HttpRouter,
} from "@effect/platform"
import { BetterAuth, type BetterAuthService } from "./BetterAuth"
import { CurrentUser, CurrentSession } from "./Session"
import * as Errors from "./Errors"

// ============================================================================
// Authentication Middleware
// ============================================================================

/**
 * Creates an authentication middleware for HttpApi
 * 
 * Usage:
 * ```ts
 * class MyApi extends HttpApiGroup.make("api")
 *   .add(...)
 *   .middleware(AuthMiddleware)
 * {}
 * ```
 */
export class AuthMiddleware extends HttpApiMiddleware.Tag<AuthMiddleware>()(
  "@better-auth/effect/AuthMiddleware",
  {
    failure: Errors.Unauthorized,
    provides: CurrentUser,
    security: {
      cookie: HttpApiSecurity.apiKey({
        in: "cookie",
        key: "better-auth.session_token",
      }),
    },
  }
) {}

/**
 * Layer that provides the AuthMiddleware implementation
 */
export const AuthMiddlewareLive: Layer.Layer<AuthMiddleware, never, BetterAuth> =
  Layer.effect(
    AuthMiddleware,
    Effect.gen(function* () {
      const betterAuth = yield* BetterAuth
      
      return {
        cookie: (_token) =>
          Effect.gen(function* () {
            const request = yield* HttpServerRequest.HttpServerRequest
            const session = yield* betterAuth.getSession(request.headers)
            return session.user
          }),
      }
    })
  )

// ============================================================================
// Full Session Middleware (provides both user and session)
// ============================================================================

/**
 * Authentication middleware that provides both user and session
 */
export class SessionMiddleware extends HttpApiMiddleware.Tag<SessionMiddleware>()(
  "@better-auth/effect/SessionMiddleware",
  {
    failure: Errors.Unauthorized,
    provides: CurrentSession,
    security: {
      cookie: HttpApiSecurity.apiKey({
        in: "cookie",
        key: "better-auth.session_token",
      }),
    },
  }
) {}

export const SessionMiddlewareLive: Layer.Layer<SessionMiddleware, never, BetterAuth> =
  Layer.effect(
    SessionMiddleware,
    Effect.gen(function* () {
      const betterAuth = yield* BetterAuth
      
      return {
        cookie: (_token) =>
          Effect.gen(function* () {
            const request = yield* HttpServerRequest.HttpServerRequest
            const session = yield* betterAuth.getSession(request.headers)
            return session.session
          }),
      }
    })
  )

// ============================================================================
// Mount Better-Auth Handler
// ============================================================================

/**
 * Creates an HttpApp from better-auth handler
 * 
 * Usage:
 * ```ts
 * const router = HttpRouter.empty.pipe(
 *   HttpRouter.mountApp("/api/auth", yield* betterAuthApp)
 * )
 * ```
 */
export const betterAuthApp: Effect.Effect<
  HttpApp.Default,
  never,
  BetterAuth
> = Effect.gen(function* () {
  const { handler } = yield* BetterAuth
  return HttpApp.fromWebHandler(handler)
})

/**
 * Layer that mounts better-auth at a path
 * 
 * Usage:
 * ```ts
 * HttpApiBuilder.Router.use((router) =>
 *   router.mountApp("/api/auth", yield* betterAuthApp)
 * )
 * ```
 */
export const mountBetterAuth = (
  path: `/${string}` = "/api/auth"
): Effect.Effect<void, never, BetterAuth | HttpRouter.HttpRouter.Service<any, any>> =>
  Effect.gen(function* () {
    const app = yield* betterAuthApp
    // This would need to be adapted based on how you're using the router
  })

// ============================================================================
// Optional Auth Middleware (doesn't fail if not authenticated)
// ============================================================================

/**
 * Optional auth - provides user if authenticated, undefined otherwise
 */
export class OptionalUser extends Context.Tag("@better-auth/effect/OptionalUser")<
  OptionalUser,
  Record<string, any> | undefined
>() {}

export class OptionalAuthMiddleware extends HttpApiMiddleware.Tag<OptionalAuthMiddleware>()(
  "@better-auth/effect/OptionalAuthMiddleware",
  {
    provides: OptionalUser,
    security: {
      cookie: HttpApiSecurity.apiKey({
        in: "cookie", 
        key: "better-auth.session_token",
      }),
    },
  },
  { optional: true }
) {}

export const OptionalAuthMiddlewareLive: Layer.Layer<
  OptionalAuthMiddleware,
  never,
  BetterAuth
> = Layer.effect(
  OptionalAuthMiddleware,
  Effect.gen(function* () {
    const betterAuth = yield* BetterAuth
    
    return {
      cookie: (_token) =>
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest
          const result = yield* Effect.either(
            betterAuth.getSession(request.headers)
          )
          return result._tag === "Right" ? result.right.user : undefined
        }),
    }
  })
)
```

### 5. Complete Example Usage

```typescript
// ============================================================================
// auth.ts - Configure Better Auth
// ============================================================================
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { db } from "./db"

export const authConfig = {
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: { enabled: true },
  // ... other config
}

export type AuthConfig = typeof authConfig

// ============================================================================
// auth-effect.ts - Effect-native auth service
// ============================================================================
import { Layer } from "effect"
import { BetterAuth, layer as betterAuthLayer } from "@better-auth/effect"
import { authConfig } from "./auth"

export const BetterAuthLive = betterAuthLayer(authConfig)

// Re-export for convenience
export { BetterAuth } from "@better-auth/effect"
export { CurrentUser, CurrentSession } from "@better-auth/effect"
export {
  AuthMiddleware,
  AuthMiddlewareLive,
  SessionMiddleware,
  SessionMiddlewareLive,
} from "@better-auth/effect"

// ============================================================================
// api.ts - Define your API with HttpApi
// ============================================================================
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpApiMiddleware,
  HttpMiddleware,
  HttpServer,
  HttpRouter,
  HttpApp,
} from "@effect/platform"
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { Effect, Layer, Schema } from "effect"
import { createServer } from "node:http"

import { 
  BetterAuth,
  BetterAuthLive,
  CurrentUser,
  AuthMiddleware,
  AuthMiddlewareLive,
  betterAuthApp,
} from "./auth-effect"

// Define schemas
class UserProfile extends Schema.Class<UserProfile>("UserProfile")({
  id: Schema.String,
  email: Schema.String,
  name: Schema.String,
}) {}

class CreatePostInput extends Schema.Class<CreatePostInput>("CreatePostInput")({
  title: Schema.String,
  content: Schema.String,
}) {}

class Post extends Schema.Class<Post>("Post")({
  id: Schema.String,
  title: Schema.String,
  content: Schema.String,
  authorId: Schema.String,
}) {}

// Protected API group - requires authentication
class UsersApi extends HttpApiGroup.make("users")
  .add(
    HttpApiEndpoint.get("me", "/me")
      .addSuccess(UserProfile)
  )
  .add(
    HttpApiEndpoint.get("profile", "/profile/:id")
      .addSuccess(UserProfile)
  )
  .middleware(AuthMiddleware)  // All endpoints require auth
  .prefix("/users")
{}

class PostsApi extends HttpApiGroup.make("posts")
  .add(
    HttpApiEndpoint.get("list", "/")
      .addSuccess(Schema.Array(Post))
  )
  .add(
    HttpApiEndpoint.post("create", "/")
      .setPayload(CreatePostInput)
      .addSuccess(Post)
      .middleware(AuthMiddleware)  // Only this endpoint requires auth
  )
  .prefix("/posts")
{}

// Combine into full API
class MyApi extends HttpApi.make("my-api")
  .add(UsersApi)
  .add(PostsApi)
{}

// ============================================================================
// handlers.ts - Implement the handlers
// ============================================================================

const UsersHandlers = HttpApiBuilder.group(MyApi, "users", (handlers) =>
  handlers
    .handle("me", () =>
      Effect.gen(function* () {
        // CurrentUser is automatically available due to AuthMiddleware
        const user = yield* CurrentUser
        return new UserProfile({
          id: user.id,
          email: user.email,
          name: user.name,
        })
      })
    )
    .handle("profile", ({ path }) =>
      Effect.gen(function* () {
        // Fetch user by ID from database
        // ... your implementation
        return new UserProfile({
          id: path.id,
          email: "user@example.com",
          name: "User",
        })
      })
    )
).pipe(Layer.provide(AuthMiddlewareLive))

const PostsHandlers = HttpApiBuilder.group(MyApi, "posts", (handlers) =>
  handlers
    .handle("list", () =>
      Effect.gen(function* () {
        // Public endpoint - no auth required
        return []
      })
    )
    .handle("create", ({ payload }) =>
      Effect.gen(function* () {
        const user = yield* CurrentUser
        return new Post({
          id: "new-post-id",
          title: payload.title,
          content: payload.content,
          authorId: user.id,
        })
      })
    )
).pipe(Layer.provide(AuthMiddlewareLive))

// ============================================================================
// server.ts - Start the server
// ============================================================================

const ApiLive = HttpApiBuilder.api(MyApi).pipe(
  Layer.provide([UsersHandlers, PostsHandlers])
)

// Custom router to mount better-auth
const AuthRouterLive = HttpApiBuilder.Router.use((router) =>
  Effect.gen(function* () {
    const authApp = yield* betterAuthApp
    yield* router.mountApp("/api/auth", authApp)
  })
)

// Serve everything
HttpApiBuilder.serve(HttpMiddleware.logger).pipe(
  Layer.provide(AuthRouterLive),
  Layer.provide(ApiLive),
  Layer.provide(BetterAuthLive),
  HttpServer.withLogAddress,
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 })),
  Layer.launch,
  NodeRuntime.runMain
)
```

### 6. Using BetterAuth Service Directly

```typescript
import { Effect } from "effect"
import { BetterAuth } from "@better-auth/effect"

// In an Effect context
const program = Effect.gen(function* () {
  const auth = yield* BetterAuth
  
  // Sign up a new user
  const { user, session } = yield* auth.signUpEmail({
    email: "user@example.com",
    password: "securepassword",
    name: "New User",
  })
  
  console.log("Created user:", user)
  
  // Sign in
  const signInResult = yield* auth.signInEmail({
    email: "user@example.com",
    password: "securepassword",
  })
  
  // Get session
  const headers = new Headers()
  headers.set("cookie", `better-auth.session_token=${session.token}`)
  
  const currentSession = yield* auth.getSession(headers)
  console.log("Current session:", currentSession)
})

// Run with layer
program.pipe(
  Effect.provide(BetterAuthLive),
  Effect.runPromise
)
```

## Phase 2: Database Integration with @effect/sql-drizzle

For users who want full Effect-native database operations:

```typescript
import { PgDrizzle } from "@effect/sql-drizzle/Pg"
import { PgClient } from "@effect/sql-pg"
import { Layer, Effect } from "effect"
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"

// Create auth with Effect-Drizzle
export const makeBetterAuthWithEffectDrizzle = Effect.gen(function* () {
  const db = yield* PgDrizzle
  
  return betterAuth({
    database: drizzleAdapter(db, { provider: "pg" }),
    // ... config
  })
})
```

## Documentation Structure

New documentation page: `docs/content/docs/integrations/effect-platform.mdx`

### Sections:
1. **Overview** - What Effect/Platform is and why use it
2. **Installation** - Dependencies and setup
3. **Basic Integration** - Simple mounting of handler
4. **Effect-Native Usage** - Using the BetterAuth service
5. **HttpApi Integration** - Type-safe API with middleware
6. **Authentication Patterns** - Protected routes, optional auth
7. **Error Handling** - Typed errors and recovery
8. **Database Integration** - Using with @effect/sql-drizzle
9. **Full Example** - Complete application

## Implementation Phases

### Phase 1: Core Package (Week 1-2)
- [ ] Create `@better-auth/effect` package structure
- [ ] Implement error types
- [ ] Implement BetterAuth service
- [ ] Implement session context tags
- [ ] Basic tests

### Phase 2: HttpApi Integration (Week 2-3)
- [ ] Implement AuthMiddleware
- [ ] Implement SessionMiddleware  
- [ ] Implement OptionalAuthMiddleware
- [ ] Handler mounting utilities
- [ ] Integration tests

### Phase 3: Documentation (Week 3-4)
- [ ] Write integration guide
- [ ] Create examples
- [ ] Add to docs navigation
- [ ] Review and polish

### Phase 4: Advanced Features (Week 4+)
- [ ] @effect/sql-drizzle integration
- [ ] OpenAPI integration
- [ ] Client generation helpers
- [ ] Additional middleware patterns

## Files to Create/Modify

### New Files
```
packages/effect/
├── package.json
├── tsconfig.json
├── tsdown.config.ts
├── src/
│   ├── index.ts
│   ├── BetterAuth.ts
│   ├── Session.ts
│   ├── Errors.ts
│   ├── HttpApi.ts
│   └── Middleware.ts
└── test/
    ├── BetterAuth.test.ts
    └── HttpApi.test.ts

docs/content/docs/integrations/effect-platform.mdx
```

### Modified Files
```
pnpm-workspace.yaml          # Add effect package
packages/better-auth/package.json  # Add peer dep mention
docs/source.config.ts        # Add new doc page
```

## GitHub Issue Template

```markdown
## Feature Request: Effect/Platform Native Integration

### Summary
Add official Effect-native integration for using Better-Auth with Effect/Platform's HttpApi builder.

### Motivation
Effect/Platform is gaining popularity for building type-safe APIs. Users want to use Better-Auth in an Effect-native way where:
- All auth operations return `Effect`s with typed errors
- Integration with Effect's dependency injection (Context/Layer)
- Seamless integration with HttpApi middleware system
- Type-safe session access in handlers

### Related Issues
- #7234 (Drizzle Effect-based execution)

### Proposed Solution
Create a new `@better-auth/effect` package that provides:
1. Effect-wrapped auth operations
2. HttpApiMiddleware for authentication
3. Typed error types using Effect Schema
4. Session context tags (CurrentUser, CurrentSession)

### Example Usage
```typescript
import { HttpApiBuilder, HttpApiGroup, HttpApiEndpoint } from "@effect/platform"
import { BetterAuth, AuthMiddleware, CurrentUser } from "@better-auth/effect"

class ProtectedApi extends HttpApiGroup.make("api")
  .add(HttpApiEndpoint.get("me", "/me").addSuccess(User))
  .middleware(AuthMiddleware)
{}

const handler = HttpApiBuilder.group(MyApi, "api", (h) =>
  h.handle("me", () => CurrentUser)  // Direct access to typed user
).pipe(Layer.provide(AuthMiddlewareLive))
```

### Additional Context
- Builds on existing better-auth architecture
- Non-breaking addition (new package)
- Aligns with modern TypeScript best practices
```

## Summary

This plan creates a truly **Effect-native** integration where:

1. ✅ All auth operations return `Effect`s
2. ✅ Typed errors using Effect Schema
3. ✅ Dependency injection via Context/Layer
4. ✅ Seamless HttpApi middleware integration
5. ✅ Type-safe session access in handlers
6. ✅ Optional future integration with @effect/sql-drizzle

The integration follows Effect's patterns and provides a first-class developer experience for Effect/Platform users.
