/**
 * @better-auth/effect
 *
 * Effect-native integration for Better Auth with Effect/Platform.
 *
 * @example Basic Usage
 * ```typescript
 * import { BetterAuth, layer, CurrentUser } from "@better-auth/effect"
 * import { Effect } from "effect"
 *
 * // Create the service layer
 * const BetterAuthLive = layer({
 *   database: drizzleAdapter(db, { provider: "pg" }),
 *   emailAndPassword: { enabled: true },
 * })
 *
 * // Use in your Effect program
 * const program = Effect.gen(function* () {
 *   const auth = yield* BetterAuth
 *   const { user, session } = yield* auth.signInEmail({
 *     email: "user@example.com",
 *     password: "password",
 *   })
 *   return user
 * })
 *
 * // Run with the layer
 * program.pipe(Effect.provide(BetterAuthLive))
 * ```
 *
 * @example HttpApi Integration
 * ```typescript
 * import { HttpApiGroup, HttpApiEndpoint, HttpApiBuilder } from "@effect/platform"
 * import { AuthMiddleware, AuthMiddlewareLive, CurrentUser } from "@better-auth/effect"
 *
 * // Define protected API
 * class UsersApi extends HttpApiGroup.make("users")
 *   .add(HttpApiEndpoint.get("me", "/me").addSuccess(UserProfile))
 *   .middleware(AuthMiddleware)
 * {}
 *
 * // Implement handlers
 * const UsersLive = HttpApiBuilder.group(MyApi, "users", (handlers) =>
 *   handlers.handle("me", () =>
 *     Effect.gen(function* () {
 *       const user = yield* CurrentUser
 *       return new UserProfile(user)
 *     })
 *   )
 * ).pipe(Layer.provide(AuthMiddlewareLive))
 * ```
 *
 * @packageDocumentation
 */

// ============================================================================
// Service
// ============================================================================

export {
  BetterAuth,
  type BetterAuthService,
  make,
  layer,
  layerFromAuth,
} from "./BetterAuth.js";

// ============================================================================
// Session Context
// ============================================================================

export {
  CurrentUser,
  CurrentSession,
  AuthSession,
  OptionalUser,
  makeSessionContext,
  type InferUser,
  type InferSession,
  type InferSessionData,
} from "./Session.js";

// ============================================================================
// Errors
// ============================================================================

export {
  AuthError,
  Unauthorized,
  Forbidden,
  SessionExpired,
  InvalidCredentials,
  UserNotFound,
  EmailAlreadyExists,
  RateLimited,
  InternalAuthError,
  type AnyAuthError,
} from "./Errors.js";

// ============================================================================
// HttpApi Integration
// ============================================================================

export {
  // Middleware
  AuthMiddleware,
  AuthMiddlewareLive,
  SessionMiddleware,
  SessionMiddlewareLive,
  FullAuthMiddleware,
  FullAuthMiddlewareLive,
  OptionalAuthMiddleware,
  OptionalAuthMiddlewareLive,
  AllAuthMiddlewareLive,
  // Handler mounting
  betterAuthApp,
  betterAuthAppFrom,
  mountBetterAuth,
  // Configuration
  DEFAULT_SESSION_COOKIE,
  type AuthMiddlewareConfig,
} from "./HttpApi.js";
