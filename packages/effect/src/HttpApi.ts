/**
 * @module HttpApi
 * @description HttpApi integration for Better Auth with Effect/Platform.
 * Provides middleware, security, and mounting utilities.
 */

import { Context, Effect, Layer } from "effect";
import {
  HttpApiMiddleware,
  HttpApiSecurity,
  HttpServerRequest,
  HttpApp,
  HttpRouter,
  HttpServerResponse,
} from "@effect/platform";
import type { HttpServerError } from "@effect/platform";
import { BetterAuth, type BetterAuthService } from "./BetterAuth.js";
import { CurrentUser, CurrentSession, AuthSession, OptionalUser } from "./Session.js";
import * as Errors from "./Errors.js";

// ============================================================================
// Cookie Configuration
// ============================================================================

/**
 * Default session cookie name used by better-auth
 */
export const DEFAULT_SESSION_COOKIE = "better-auth.session_token";

/**
 * Configuration for the auth middleware
 */
export interface AuthMiddlewareConfig {
  /**
   * The name of the session cookie
   * @default "better-auth.session_token"
   */
  readonly cookieName?: string;
}

// ============================================================================
// Authentication Middleware
// ============================================================================

/**
 * Authentication middleware that provides the CurrentUser context.
 * Use this on HttpApiGroup or HttpApiEndpoint to require authentication.
 *
 * @example
 * ```typescript
 * import { AuthMiddleware } from "@better-auth/effect"
 *
 * class ProtectedApi extends HttpApiGroup.make("protected")
 *   .add(HttpApiEndpoint.get("me", "/me").addSuccess(UserProfile))
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
        key: DEFAULT_SESSION_COOKIE,
      }),
    },
  }
) {}

/**
 * Layer that provides the AuthMiddleware implementation.
 * Requires BetterAuth service to be available.
 *
 * @example
 * ```typescript
 * const UsersLive = HttpApiBuilder.group(MyApi, "users", (handlers) =>
 *   handlers.handle("me", () => CurrentUser)
 * ).pipe(Layer.provide(AuthMiddlewareLive))
 * ```
 */
export const AuthMiddlewareLive: Layer.Layer<AuthMiddleware, never, BetterAuth> =
  Layer.effect(
    AuthMiddleware,
    Effect.gen(function* () {
      const betterAuth = yield* BetterAuth;

      return {
        cookie: (_token) =>
          Effect.gen(function* () {
            const request = yield* HttpServerRequest.HttpServerRequest;
            const session = yield* betterAuth.getSession(request.headers);
            return session.user;
          }),
      };
    })
  );

// ============================================================================
// Session Middleware
// ============================================================================

/**
 * Session middleware that provides the CurrentSession context.
 * Use when you need access to session data (token, expiry, etc.).
 *
 * @example
 * ```typescript
 * import { SessionMiddleware } from "@better-auth/effect"
 *
 * class SessionApi extends HttpApiGroup.make("session")
 *   .add(HttpApiEndpoint.get("info", "/info").addSuccess(SessionInfo))
 *   .middleware(SessionMiddleware)
 * {}
 * ```
 */
export class SessionMiddleware extends HttpApiMiddleware.Tag<SessionMiddleware>()(
  "@better-auth/effect/SessionMiddleware",
  {
    failure: Errors.Unauthorized,
    provides: CurrentSession,
    security: {
      cookie: HttpApiSecurity.apiKey({
        in: "cookie",
        key: DEFAULT_SESSION_COOKIE,
      }),
    },
  }
) {}

/**
 * Layer that provides the SessionMiddleware implementation.
 */
export const SessionMiddlewareLive: Layer.Layer<
  SessionMiddleware,
  never,
  BetterAuth
> = Layer.effect(
  SessionMiddleware,
  Effect.gen(function* () {
    const betterAuth = yield* BetterAuth;

    return {
      cookie: (_token) =>
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest;
          const session = yield* betterAuth.getSession(request.headers);
          return session.session;
        }),
    };
  })
);

// ============================================================================
// Full Auth Session Middleware
// ============================================================================

/**
 * Full auth session middleware that provides both user and session.
 * Use when you need access to both user and session data.
 *
 * @example
 * ```typescript
 * import { FullAuthMiddleware, AuthSession } from "@better-auth/effect"
 *
 * const handler = Effect.gen(function* () {
 *   const { user, session } = yield* AuthSession
 *   // Access both user and session
 * })
 * ```
 */
export class FullAuthMiddleware extends HttpApiMiddleware.Tag<FullAuthMiddleware>()(
  "@better-auth/effect/FullAuthMiddleware",
  {
    failure: Errors.Unauthorized,
    provides: AuthSession,
    security: {
      cookie: HttpApiSecurity.apiKey({
        in: "cookie",
        key: DEFAULT_SESSION_COOKIE,
      }),
    },
  }
) {}

/**
 * Layer that provides the FullAuthMiddleware implementation.
 */
export const FullAuthMiddlewareLive: Layer.Layer<
  FullAuthMiddleware,
  never,
  BetterAuth
> = Layer.effect(
  FullAuthMiddleware,
  Effect.gen(function* () {
    const betterAuth = yield* BetterAuth;

    return {
      cookie: (_token) =>
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest;
          const session = yield* betterAuth.getSession(request.headers);
          return { user: session.user, session: session.session };
        }),
    };
  })
);

// ============================================================================
// Optional Auth Middleware
// ============================================================================

/**
 * Optional authentication middleware.
 * Provides user if authenticated, undefined otherwise. Never fails.
 *
 * @example
 * ```typescript
 * import { OptionalAuthMiddleware, OptionalUser } from "@better-auth/effect"
 *
 * class PublicApi extends HttpApiGroup.make("public")
 *   .add(HttpApiEndpoint.get("greeting", "/greeting").addSuccess(Greeting))
 *   .middleware(OptionalAuthMiddleware)
 * {}
 *
 * const handler = Effect.gen(function* () {
 *   const maybeUser = yield* OptionalUser
 *   if (maybeUser) {
 *     return { message: `Hello, ${maybeUser.name}!` }
 *   }
 *   return { message: "Hello, guest!" }
 * })
 * ```
 */
export class OptionalAuthMiddleware extends HttpApiMiddleware.Tag<OptionalAuthMiddleware>()(
  "@better-auth/effect/OptionalAuthMiddleware",
  {
    provides: OptionalUser,
    security: {
      cookie: HttpApiSecurity.apiKey({
        in: "cookie",
        key: DEFAULT_SESSION_COOKIE,
      }),
    },
  },
  { optional: true }
) {}

/**
 * Layer that provides the OptionalAuthMiddleware implementation.
 */
export const OptionalAuthMiddlewareLive: Layer.Layer<
  OptionalAuthMiddleware,
  never,
  BetterAuth
> = Layer.effect(
  OptionalAuthMiddleware,
  Effect.gen(function* () {
    const betterAuth = yield* BetterAuth;

    return {
      cookie: (_token) =>
        Effect.gen(function* () {
          const request = yield* HttpServerRequest.HttpServerRequest;
          const result = yield* Effect.either(
            betterAuth.getSession(request.headers)
          );
          return result._tag === "Right" ? result.right.user : undefined;
        }),
    };
  })
);

// ============================================================================
// Handler Mounting
// ============================================================================

/**
 * Creates an HttpApp from the BetterAuth handler.
 * Use this to mount better-auth routes in your HttpRouter.
 *
 * @example
 * ```typescript
 * import { betterAuthApp } from "@better-auth/effect"
 *
 * const program = Effect.gen(function* () {
 *   const authApp = yield* betterAuthApp
 *   // Mount at /api/auth
 * })
 * ```
 */
export const betterAuthApp: Effect.Effect<
  HttpApp.Default<HttpServerError.HttpServerError>,
  never,
  BetterAuth
> = Effect.gen(function* () {
  const { handler } = yield* BetterAuth;
  return HttpApp.fromWebHandler(handler);
});

/**
 * Creates an HttpApp from a better-auth instance directly.
 * Useful when you don't want to use the service pattern.
 *
 * @example
 * ```typescript
 * import { auth } from "./auth"
 * import { betterAuthAppFrom } from "@better-auth/effect"
 *
 * const authApp = betterAuthAppFrom(auth)
 * ```
 */
export const betterAuthAppFrom = (auth: {
  handler: (request: Request) => Promise<Response>;
}): HttpApp.Default<HttpServerError.HttpServerError> =>
  HttpApp.fromWebHandler(auth.handler);

/**
 * Effect that mounts better-auth at a specified path using the Router service.
 *
 * @example
 * ```typescript
 * import { mountBetterAuth } from "@better-auth/effect"
 *
 * // In your server setup
 * HttpApiBuilder.Router.use((router) =>
 *   Effect.gen(function* () {
 *     yield* mountBetterAuth("/api/auth")
 *   })
 * )
 * ```
 */
export const mountBetterAuth = (
  path: `/${string}` = "/api/auth"
): Effect.Effect<
  void,
  never,
  BetterAuth | HttpRouter.HttpRouter.Service<never, never>
> =>
  Effect.gen(function* () {
    const authApp = yield* betterAuthApp;
    const router = yield* HttpRouter.HttpRouter as any;
    yield* router.mountApp(path, authApp);
  });

// ============================================================================
// Combined Middleware Layers
// ============================================================================

/**
 * Combined layer that provides all auth middleware implementations.
 * Convenient when you use multiple middleware types.
 *
 * @example
 * ```typescript
 * import { AllAuthMiddlewareLive } from "@better-auth/effect"
 *
 * const ApiLive = HttpApiBuilder.api(MyApi).pipe(
 *   Layer.provide(AllAuthMiddlewareLive),
 *   Layer.provide(BetterAuthLive)
 * )
 * ```
 */
export const AllAuthMiddlewareLive: Layer.Layer<
  AuthMiddleware | SessionMiddleware | FullAuthMiddleware | OptionalAuthMiddleware,
  never,
  BetterAuth
> = Layer.mergeAll(
  AuthMiddlewareLive,
  SessionMiddlewareLive,
  FullAuthMiddlewareLive,
  OptionalAuthMiddlewareLive
);
