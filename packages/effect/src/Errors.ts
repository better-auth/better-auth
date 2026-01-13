/**
 * @module Errors
 * @description Typed error classes for Better Auth Effect integration.
 * All errors extend Effect Schema's TaggedError for type-safe error handling.
 */

import { Schema } from "effect";
import { HttpApiSchema } from "@effect/platform";

/**
 * Base authentication error
 */
export class AuthError extends Schema.TaggedError<AuthError>()("AuthError", {
  message: Schema.String,
  code: Schema.String,
}) {}

/**
 * Unauthorized error - returned when no valid session exists
 * HTTP Status: 401
 */
export class Unauthorized extends Schema.TaggedError<Unauthorized>()(
  "Unauthorized",
  {
    message: Schema.String,
  },
  HttpApiSchema.annotations({ status: 401 })
) {}

/**
 * Forbidden error - returned when user lacks permission
 * HTTP Status: 403
 */
export class Forbidden extends Schema.TaggedError<Forbidden>()(
  "Forbidden",
  {
    message: Schema.String,
    code: Schema.optional(Schema.String),
  },
  HttpApiSchema.annotations({ status: 403 })
) {}

/**
 * Session expired error - returned when session has expired
 * HTTP Status: 401
 */
export class SessionExpired extends Schema.TaggedError<SessionExpired>()(
  "SessionExpired",
  {
    message: Schema.String,
  },
  HttpApiSchema.annotations({ status: 401 })
) {}

/**
 * Invalid credentials error - returned on failed login attempt
 * HTTP Status: 401
 */
export class InvalidCredentials extends Schema.TaggedError<InvalidCredentials>()(
  "InvalidCredentials",
  {
    message: Schema.String,
  },
  HttpApiSchema.annotations({ status: 401 })
) {}

/**
 * User not found error
 * HTTP Status: 404
 */
export class UserNotFound extends Schema.TaggedError<UserNotFound>()(
  "UserNotFound",
  {
    message: Schema.String,
  },
  HttpApiSchema.annotations({ status: 404 })
) {}

/**
 * Email already exists error - returned on signup with existing email
 * HTTP Status: 409
 */
export class EmailAlreadyExists extends Schema.TaggedError<EmailAlreadyExists>()(
  "EmailAlreadyExists",
  {
    message: Schema.String,
  },
  HttpApiSchema.annotations({ status: 409 })
) {}

/**
 * Rate limited error - returned when rate limit is exceeded
 * HTTP Status: 429
 */
export class RateLimited extends Schema.TaggedError<RateLimited>()(
  "RateLimited",
  {
    message: Schema.String,
    retryAfter: Schema.optional(Schema.Number),
  },
  HttpApiSchema.annotations({ status: 429 })
) {}

/**
 * Internal auth error - unexpected errors
 * HTTP Status: 500
 */
export class InternalAuthError extends Schema.TaggedError<InternalAuthError>()(
  "InternalAuthError",
  {
    message: Schema.String,
    cause: Schema.optional(Schema.Unknown),
  },
  HttpApiSchema.annotations({ status: 500 })
) {}

/**
 * Union type of all auth errors for type narrowing
 */
export type AnyAuthError =
  | AuthError
  | Unauthorized
  | Forbidden
  | SessionExpired
  | InvalidCredentials
  | UserNotFound
  | EmailAlreadyExists
  | RateLimited
  | InternalAuthError;
