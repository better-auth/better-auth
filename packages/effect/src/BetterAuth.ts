/**
 * @module BetterAuth
 * @description Effect-native Better Auth service with typed operations.
 */

import { Context, Effect, Layer } from "effect";
import type { Auth, BetterAuthOptions } from "better-auth";
import { betterAuth } from "better-auth";
import * as Errors from "./Errors.js";
import type { InferUser, InferSession } from "./Session.js";

// ============================================================================
// Service Interface
// ============================================================================

/**
 * The BetterAuth service interface providing Effect-wrapped auth operations.
 */
export interface BetterAuthService<A extends Auth<any> = Auth<any>> {
  /**
   * The underlying better-auth instance
   */
  readonly auth: A;

  /**
   * Get the current session from request headers.
   *
   * @example
   * ```typescript
   * const session = yield* betterAuth.getSession(request.headers)
   * ```
   */
  readonly getSession: (
    headers: Headers
  ) => Effect.Effect<
    { user: InferUser<A>; session: InferSession<A> },
    Errors.Unauthorized
  >;

  /**
   * Sign in with email and password.
   *
   * @example
   * ```typescript
   * const { user, session } = yield* betterAuth.signInEmail({
   *   email: "user@example.com",
   *   password: "password123",
   * })
   * ```
   */
  readonly signInEmail: (params: {
    email: string;
    password: string;
    rememberMe?: boolean;
  }) => Effect.Effect<
    { user: InferUser<A>; session: InferSession<A> },
    Errors.InvalidCredentials | Errors.UserNotFound | Errors.RateLimited
  >;

  /**
   * Sign up with email and password.
   *
   * @example
   * ```typescript
   * const { user, session } = yield* betterAuth.signUpEmail({
   *   email: "newuser@example.com",
   *   password: "password123",
   *   name: "New User",
   * })
   * ```
   */
  readonly signUpEmail: (params: {
    email: string;
    password: string;
    name: string;
    [key: string]: unknown;
  }) => Effect.Effect<
    { user: InferUser<A>; session: InferSession<A> },
    Errors.EmailAlreadyExists | Errors.RateLimited
  >;

  /**
   * Sign out the current session.
   *
   * @example
   * ```typescript
   * yield* betterAuth.signOut(request.headers)
   * ```
   */
  readonly signOut: (headers: Headers) => Effect.Effect<void, Errors.Unauthorized>;

  /**
   * List all active sessions for the current user.
   *
   * @example
   * ```typescript
   * const sessions = yield* betterAuth.listSessions(request.headers)
   * ```
   */
  readonly listSessions: (
    headers: Headers
  ) => Effect.Effect<Array<InferSession<A>>, Errors.Unauthorized>;

  /**
   * Revoke a specific session by token.
   *
   * @example
   * ```typescript
   * yield* betterAuth.revokeSession(sessionToken, request.headers)
   * ```
   */
  readonly revokeSession: (
    token: string,
    headers: Headers
  ) => Effect.Effect<void, Errors.Unauthorized>;

  /**
   * Revoke all sessions except the current one.
   *
   * @example
   * ```typescript
   * yield* betterAuth.revokeOtherSessions(request.headers)
   * ```
   */
  readonly revokeOtherSessions: (
    headers: Headers
  ) => Effect.Effect<void, Errors.Unauthorized>;

  /**
   * The raw request handler for mounting.
   * Use this with HttpRouter.mountApp or similar.
   */
  readonly handler: (request: Request) => Promise<Response>;
}

// ============================================================================
// Service Tag
// ============================================================================

/**
 * Context tag for the BetterAuth service.
 *
 * @example
 * ```typescript
 * import { BetterAuth } from "@better-auth/effect"
 *
 * const program = Effect.gen(function* () {
 *   const auth = yield* BetterAuth
 *   const session = yield* auth.getSession(headers)
 * })
 * ```
 */
export class BetterAuth extends Context.Tag("@better-auth/effect/BetterAuth")<
  BetterAuth,
  BetterAuthService
>() {}

// ============================================================================
// Error Mapping
// ============================================================================

/**
 * Maps API errors from better-auth to typed Effect errors
 */
const mapApiError = (error: unknown): Errors.AnyAuthError => {
  const err = error as any;
  const code = err?.code || err?.body?.code || err?.status || "UNKNOWN";
  const message =
    err?.message || err?.body?.message || err?.statusText || "An error occurred";

  switch (code) {
    case "UNAUTHORIZED":
    case "INVALID_SESSION":
      return new Errors.Unauthorized({ message });

    case "INVALID_CREDENTIALS":
    case "INVALID_PASSWORD":
    case "INVALID_EMAIL_OR_PASSWORD":
      return new Errors.InvalidCredentials({ message });

    case "USER_NOT_FOUND":
      return new Errors.UserNotFound({ message });

    case "EMAIL_ALREADY_EXISTS":
    case "USER_ALREADY_EXISTS":
      return new Errors.EmailAlreadyExists({ message });

    case "RATE_LIMIT_EXCEEDED":
    case "TOO_MANY_REQUESTS":
      return new Errors.RateLimited({
        message,
        retryAfter: err?.retryAfter,
      });

    case "SESSION_EXPIRED":
      return new Errors.SessionExpired({ message });

    case "FORBIDDEN":
      return new Errors.Forbidden({ message, code });

    default:
      return new Errors.AuthError({ message, code: String(code) });
  }
};

// ============================================================================
// Service Implementation
// ============================================================================

/**
 * Creates a BetterAuth service instance.
 *
 * @example
 * ```typescript
 * const service = yield* make({
 *   database: drizzleAdapter(db, { provider: "pg" }),
 *   emailAndPassword: { enabled: true },
 * })
 * ```
 */
export const make = <Options extends BetterAuthOptions>(
  options: Options
): Effect.Effect<BetterAuthService<Auth<Options>>> =>
  Effect.sync(() => {
    const auth = betterAuth(options);

    const service: BetterAuthService<Auth<Options>> = {
      auth: auth as Auth<Options>,

      getSession: (headers: Headers) =>
        Effect.tryPromise({
          try: () => auth.api.getSession({ headers }),
          catch: mapApiError,
        }).pipe(
          Effect.flatMap((session) =>
            session
              ? Effect.succeed(session as any)
              : Effect.fail(
                  new Errors.Unauthorized({ message: "No session found" })
                )
          )
        ) as any,

      signInEmail: (params) =>
        Effect.tryPromise({
          try: () =>
            auth.api.signInEmail({
              body: params,
            }),
          catch: mapApiError,
        }) as any,

      signUpEmail: (params) =>
        Effect.tryPromise({
          try: () =>
            auth.api.signUpEmail({
              body: params,
            }),
          catch: mapApiError,
        }) as any,

      signOut: (headers: Headers) =>
        Effect.tryPromise({
          try: () => auth.api.signOut({ headers }),
          catch: mapApiError,
        }).pipe(Effect.asVoid) as any,

      listSessions: (headers: Headers) =>
        Effect.tryPromise({
          try: () => auth.api.listSessions({ headers }),
          catch: mapApiError,
        }) as any,

      revokeSession: (token: string, headers: Headers) =>
        Effect.tryPromise({
          try: () =>
            auth.api.revokeSession({
              headers,
              body: { token },
            }),
          catch: mapApiError,
        }).pipe(Effect.asVoid) as any,

      revokeOtherSessions: (headers: Headers) =>
        Effect.tryPromise({
          try: () => auth.api.revokeOtherSessions({ headers }),
          catch: mapApiError,
        }).pipe(Effect.asVoid) as any,

      handler: auth.handler,
    };

    return service;
  });

// ============================================================================
// Layer Constructor
// ============================================================================

/**
 * Creates a Layer that provides the BetterAuth service.
 *
 * @example
 * ```typescript
 * import { layer } from "@better-auth/effect"
 *
 * const BetterAuthLive = layer({
 *   database: drizzleAdapter(db, { provider: "pg" }),
 *   emailAndPassword: { enabled: true },
 * })
 *
 * // Use in your app
 * program.pipe(Effect.provide(BetterAuthLive))
 * ```
 */
export const layer = <Options extends BetterAuthOptions>(
  options: Options
): Layer.Layer<BetterAuth> => Layer.effect(BetterAuth, make(options)) as any;

/**
 * Creates a Layer from an existing better-auth instance.
 *
 * @example
 * ```typescript
 * import { auth } from "./auth"
 * import { layerFromAuth } from "@better-auth/effect"
 *
 * const BetterAuthLive = layerFromAuth(auth)
 * ```
 */
export const layerFromAuth = <A extends Auth<any>>(
  auth: A
): Layer.Layer<BetterAuth> =>
  Layer.succeed(BetterAuth, {
    auth,

    getSession: (headers: Headers) =>
      Effect.tryPromise({
        try: () => auth.api.getSession({ headers }),
        catch: mapApiError,
      }).pipe(
        Effect.flatMap((session) =>
          session
            ? Effect.succeed(session as any)
            : Effect.fail(
                new Errors.Unauthorized({ message: "No session found" })
              )
        )
      ) as any,

    signInEmail: (params) =>
      Effect.tryPromise({
        try: () => auth.api.signInEmail({ body: params }),
        catch: mapApiError,
      }) as any,

    signUpEmail: (params) =>
      Effect.tryPromise({
        try: () => auth.api.signUpEmail({ body: params }),
        catch: mapApiError,
      }) as any,

    signOut: (headers: Headers) =>
      Effect.tryPromise({
        try: () => auth.api.signOut({ headers }),
        catch: mapApiError,
      }).pipe(Effect.asVoid) as any,

    listSessions: (headers: Headers) =>
      Effect.tryPromise({
        try: () => auth.api.listSessions({ headers }),
        catch: mapApiError,
      }) as any,

    revokeSession: (token: string, headers: Headers) =>
      Effect.tryPromise({
        try: () => auth.api.revokeSession({ headers, body: { token } }),
        catch: mapApiError,
      }).pipe(Effect.asVoid) as any,

    revokeOtherSessions: (headers: Headers) =>
      Effect.tryPromise({
        try: () => auth.api.revokeOtherSessions({ headers }),
        catch: mapApiError,
      }).pipe(Effect.asVoid) as any,

    handler: auth.handler,
  } as BetterAuthService) as any;
