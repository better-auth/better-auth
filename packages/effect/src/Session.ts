/**
 * @module Session
 * @description Session context tags for accessing authenticated user and session data.
 */

import { Context } from "effect";
import type { Auth } from "better-auth";

// ============================================================================
// Type Inference Helpers
// ============================================================================

/**
 * Infer the User type from a Better Auth instance
 */
export type InferUser<A extends Auth<any>> = A["$Infer"]["Session"]["user"];

/**
 * Infer the Session type from a Better Auth instance
 */
export type InferSession<A extends Auth<any>> =
  A["$Infer"]["Session"]["session"];

/**
 * Infer the full session data (user + session) from a Better Auth instance
 */
export type InferSessionData<A extends Auth<any>> = {
  user: InferUser<A>;
  session: InferSession<A>;
};

// ============================================================================
// Default Context Tags (for generic usage)
// ============================================================================

/**
 * Context tag for the current authenticated user.
 *
 * @example
 * ```typescript
 * import { CurrentUser } from "@better-auth/effect"
 *
 * const handler = Effect.gen(function* () {
 *   const user = yield* CurrentUser
 *   return { id: user.id, email: user.email }
 * })
 * ```
 */
export class CurrentUser extends Context.Tag("@better-auth/effect/CurrentUser")<
  CurrentUser,
  {
    readonly id: string;
    readonly email: string;
    readonly name: string;
    readonly image?: string | null;
    readonly emailVerified: boolean;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly [key: string]: unknown;
  }
>() {}

/**
 * Context tag for the current session.
 *
 * @example
 * ```typescript
 * import { CurrentSession } from "@better-auth/effect"
 *
 * const handler = Effect.gen(function* () {
 *   const session = yield* CurrentSession
 *   return { token: session.token, expiresAt: session.expiresAt }
 * })
 * ```
 */
export class CurrentSession extends Context.Tag(
  "@better-auth/effect/CurrentSession"
)<
  CurrentSession,
  {
    readonly id: string;
    readonly token: string;
    readonly userId: string;
    readonly expiresAt: Date;
    readonly createdAt: Date;
    readonly updatedAt: Date;
    readonly ipAddress?: string | null;
    readonly userAgent?: string | null;
    readonly [key: string]: unknown;
  }
>() {}

/**
 * Context tag for combined session data (user + session).
 *
 * @example
 * ```typescript
 * import { AuthSession } from "@better-auth/effect"
 *
 * const handler = Effect.gen(function* () {
 *   const { user, session } = yield* AuthSession
 *   return { userId: user.id, sessionId: session.id }
 * })
 * ```
 */
export class AuthSession extends Context.Tag("@better-auth/effect/AuthSession")<
  AuthSession,
  {
    readonly user: CurrentUser["Type"];
    readonly session: CurrentSession["Type"];
  }
>() {}

// ============================================================================
// Typed Context Factory
// ============================================================================

/**
 * Creates typed session context tags for a specific Better Auth configuration.
 * Use this when you need exact type inference from your auth config.
 *
 * @example
 * ```typescript
 * import { makeSessionContext } from "@better-auth/effect"
 * import type { auth } from "./auth"
 *
 * const { CurrentUser, CurrentSession, AuthSession } = makeSessionContext<typeof auth>()
 *
 * // Now CurrentUser.Type is exactly your user type
 * ```
 */
export const makeSessionContext = <A extends Auth<any>>() => {
  class TypedCurrentUser extends Context.Tag(
    "@better-auth/effect/CurrentUser"
  )<TypedCurrentUser, InferUser<A>>() {}

  class TypedCurrentSession extends Context.Tag(
    "@better-auth/effect/CurrentSession"
  )<TypedCurrentSession, InferSession<A>>() {}

  class TypedAuthSession extends Context.Tag(
    "@better-auth/effect/AuthSession"
  )<
    TypedAuthSession,
    {
      readonly user: InferUser<A>;
      readonly session: InferSession<A>;
    }
  >() {}

  return {
    CurrentUser: TypedCurrentUser,
    CurrentSession: TypedCurrentSession,
    AuthSession: TypedAuthSession,
  };
};

// ============================================================================
// Optional User Context (for public routes that may have auth)
// ============================================================================

/**
 * Context tag for optional user - use on routes where auth is optional.
 *
 * @example
 * ```typescript
 * import { OptionalUser } from "@better-auth/effect"
 *
 * const handler = Effect.gen(function* () {
 *   const maybeUser = yield* OptionalUser
 *   if (maybeUser) {
 *     return { greeting: `Hello, ${maybeUser.name}!` }
 *   }
 *   return { greeting: "Hello, guest!" }
 * })
 * ```
 */
export class OptionalUser extends Context.Tag(
  "@better-auth/effect/OptionalUser"
)<OptionalUser, CurrentUser["Type"] | undefined>() {}
