# @better-auth/effect

Effect-native integration for [Better Auth](https://www.better-auth.com) with [Effect/Platform](https://effect.website).

## Features

- 🎯 **Effect-Native** - All auth operations return `Effect`s with typed errors
- 🔒 **Type-Safe** - Full type inference from your auth configuration
- 🧩 **HttpApi Integration** - Seamless middleware for Effect/Platform's HttpApi
- 💉 **Dependency Injection** - Uses Effect's Context/Layer system
- ⚡ **Composable** - Works naturally with Effect's ecosystem

## Installation

```bash
npm install @better-auth/effect better-auth effect @effect/platform
# or
pnpm add @better-auth/effect better-auth effect @effect/platform
# or
bun add @better-auth/effect better-auth effect @effect/platform
```

## Quick Start

### 1. Configure Better Auth

```typescript
// auth.ts
import { betterAuth } from "better-auth"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { db } from "./db"

export const auth = betterAuth({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: { enabled: true },
})

export type Auth = typeof auth
```

### 2. Create the Effect Layer

```typescript
// auth-effect.ts
import { layerFromAuth } from "@better-auth/effect"
import { auth } from "./auth"

export const BetterAuthLive = layerFromAuth(auth)

// Re-export for convenience
export { BetterAuth, CurrentUser, CurrentSession } from "@better-auth/effect"
```

### 3. Use in HttpApi

```typescript
// api.ts
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
  HttpServer,
  HttpMiddleware,
} from "@effect/platform"
import { NodeHttpServer, NodeRuntime } from "@effect/platform-node"
import { Effect, Layer, Schema } from "effect"
import { createServer } from "node:http"
import {
  AuthMiddleware,
  AuthMiddlewareLive,
  CurrentUser,
  betterAuthApp,
} from "@better-auth/effect"
import { BetterAuthLive } from "./auth-effect"

// Define a user profile schema
class UserProfile extends Schema.Class<UserProfile>("UserProfile")({
  id: Schema.String,
  email: Schema.String,
  name: Schema.String,
}) {}

// Protected API group
class UsersApi extends HttpApiGroup.make("users")
  .add(
    HttpApiEndpoint.get("me", "/me")
      .addSuccess(UserProfile)
  )
  .middleware(AuthMiddleware) // Requires authentication
  .prefix("/users")
{}

class MyApi extends HttpApi.make("my-api").add(UsersApi) {}

// Implement handlers
const UsersLive = HttpApiBuilder.group(MyApi, "users", (handlers) =>
  handlers.handle("me", () =>
    Effect.gen(function* () {
      const user = yield* CurrentUser
      return new UserProfile({
        id: user.id,
        email: user.email,
        name: user.name,
      })
    })
  )
).pipe(Layer.provide(AuthMiddlewareLive))

// Build and serve
const ApiLive = HttpApiBuilder.api(MyApi).pipe(
  Layer.provide(UsersLive)
)

// Mount better-auth handler
const RouterLive = HttpApiBuilder.Router.use((router) =>
  Effect.gen(function* () {
    const authApp = yield* betterAuthApp
    yield* router.mountApp("/api/auth", authApp)
  })
)

HttpApiBuilder.serve(HttpMiddleware.logger).pipe(
  Layer.provide(RouterLive),
  Layer.provide(ApiLive),
  Layer.provide(BetterAuthLive),
  HttpServer.withLogAddress,
  Layer.provide(NodeHttpServer.layer(createServer, { port: 3000 })),
  Layer.launch,
  NodeRuntime.runMain
)
```

## API Reference

### Service

#### `BetterAuth`

The main service tag for accessing auth operations.

```typescript
import { BetterAuth } from "@better-auth/effect"

const program = Effect.gen(function* () {
  const auth = yield* BetterAuth
  
  // Get session
  const session = yield* auth.getSession(headers)
  
  // Sign in
  const result = yield* auth.signInEmail({
    email: "user@example.com",
    password: "password",
  })
  
  // Sign up
  const newUser = yield* auth.signUpEmail({
    email: "new@example.com",
    password: "password",
    name: "New User",
  })
})
```

#### `layer(options)`

Creates a layer from Better Auth options.

```typescript
import { layer } from "@better-auth/effect"

const BetterAuthLive = layer({
  database: drizzleAdapter(db, { provider: "pg" }),
  emailAndPassword: { enabled: true },
})
```

#### `layerFromAuth(auth)`

Creates a layer from an existing Better Auth instance.

```typescript
import { layerFromAuth } from "@better-auth/effect"
import { auth } from "./auth"

const BetterAuthLive = layerFromAuth(auth)
```

### Session Context

#### `CurrentUser`

Context tag for the authenticated user.

```typescript
import { CurrentUser } from "@better-auth/effect"

const handler = Effect.gen(function* () {
  const user = yield* CurrentUser
  return { id: user.id, email: user.email }
})
```

#### `CurrentSession`

Context tag for the session data.

```typescript
import { CurrentSession } from "@better-auth/effect"

const handler = Effect.gen(function* () {
  const session = yield* CurrentSession
  return { token: session.token, expiresAt: session.expiresAt }
})
```

#### `AuthSession`

Context tag for both user and session.

```typescript
import { AuthSession } from "@better-auth/effect"

const handler = Effect.gen(function* () {
  const { user, session } = yield* AuthSession
})
```

#### `OptionalUser`

Context tag for optional authentication.

```typescript
import { OptionalUser } from "@better-auth/effect"

const handler = Effect.gen(function* () {
  const maybeUser = yield* OptionalUser
  if (maybeUser) {
    return { message: `Hello, ${maybeUser.name}!` }
  }
  return { message: "Hello, guest!" }
})
```

### Middleware

#### `AuthMiddleware` / `AuthMiddlewareLive`

Requires authentication, provides `CurrentUser`.

```typescript
class ProtectedApi extends HttpApiGroup.make("protected")
  .add(HttpApiEndpoint.get("data", "/data").addSuccess(Data))
  .middleware(AuthMiddleware)
{}

// Provide the implementation
Layer.provide(AuthMiddlewareLive)
```

#### `SessionMiddleware` / `SessionMiddlewareLive`

Requires authentication, provides `CurrentSession`.

#### `FullAuthMiddleware` / `FullAuthMiddlewareLive`

Requires authentication, provides `AuthSession` (user + session).

#### `OptionalAuthMiddleware` / `OptionalAuthMiddlewareLive`

Optional authentication, provides `OptionalUser`.

#### `AllAuthMiddlewareLive`

Combined layer for all middleware types.

```typescript
Layer.provide(AllAuthMiddlewareLive)
```

### Handler Mounting

#### `betterAuthApp`

Creates an HttpApp from the BetterAuth service.

```typescript
import { betterAuthApp } from "@better-auth/effect"

const program = Effect.gen(function* () {
  const authApp = yield* betterAuthApp
  // Mount at /api/auth
})
```

#### `betterAuthAppFrom(auth)`

Creates an HttpApp directly from a Better Auth instance.

```typescript
import { betterAuthAppFrom } from "@better-auth/effect"
import { auth } from "./auth"

const authApp = betterAuthAppFrom(auth)
```

### Errors

All errors are Effect Schema `TaggedError` classes with HTTP status codes:

```typescript
import {
  Unauthorized,       // 401
  InvalidCredentials, // 401
  SessionExpired,     // 401
  Forbidden,          // 403
  UserNotFound,       // 404
  EmailAlreadyExists, // 409
  RateLimited,        // 429
} from "@better-auth/effect"

// Handle specific errors
program.pipe(
  Effect.catchTag("Unauthorized", (e) =>
    Effect.succeed({ error: "Please log in" })
  ),
  Effect.catchTag("RateLimited", (e) =>
    Effect.succeed({ error: `Try again in ${e.retryAfter}s` })
  )
)
```

## Advanced Usage

### Typed Session Context

For exact type inference from your auth config:

```typescript
import { makeSessionContext } from "@better-auth/effect"
import type { auth } from "./auth"

const { CurrentUser, CurrentSession, AuthSession } = makeSessionContext<typeof auth>()

// CurrentUser.Type is now exactly your user type
```

### Custom Cookie Name

If you've customized the session cookie name:

```typescript
// Create custom middleware with your cookie name
import { HttpApiMiddleware, HttpApiSecurity } from "@effect/platform"
import { Unauthorized } from "@better-auth/effect"

class CustomAuthMiddleware extends HttpApiMiddleware.Tag<CustomAuthMiddleware>()(
  "CustomAuthMiddleware",
  {
    failure: Unauthorized,
    provides: CurrentUser,
    security: {
      cookie: HttpApiSecurity.apiKey({
        in: "cookie",
        key: "my-custom-session-cookie",
      }),
    },
  }
) {}
```

## License

MIT
