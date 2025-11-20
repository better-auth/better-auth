/**
 * Helper function to create custom error classes for Elysia
 *
 * Based on: https://elysiajs.com/patterns/error-handling.html#custom-error-response
 *
 * Creates error classes with:
 * - A helpful error message
 * - A programmatic error code (string identifier)
 * - A numeric HTTP status code
 * - Stack trace in development mode
 * - Custom toResponse() method for consistent error formatting
 */

export interface CustomErrorOptions {
  /** Human-readable error message */
  message: string
  /** Programmatic error code (e.g., "SUBSCRIPTION_NOT_FOUND") */
  code: string
  /** HTTP status code */
  status: number
  /** Optional additional metadata */
  metadata?: Record<string, unknown>
}

/**
 * Base custom error class for Elysia
 *
 * @example
 * ```typescript
 * const SubscriptionNotFoundError = createCustomError({
 *   message: "Subscription not found",
 *   code: "SUBSCRIPTION_NOT_FOUND",
 *   status: 404
 * })
 *
 * // In your handler
 * throw new SubscriptionNotFoundError()
 * ```
 */
export class CustomError extends Error {
  public readonly code: string
  public readonly status: number
  public readonly metadata?: Record<string, unknown>

  constructor(options: CustomErrorOptions) {
    super(options.message)
    this.name = this.constructor.name
    this.code = options.code
    this.status = options.status
    this.metadata = options.metadata

    // Capture stack trace in development mode
    if (process.env.NODE_ENV !== "production") {
      Error.captureStackTrace(this, this.constructor)
    }
  }

  /**
   * Custom response formatter for Elysia
   * Returns a consistent error response format
   */
  toResponse() {
    const isDevelopment = process.env.NODE_ENV !== "production"

    return Response.json(
      {
        error: {
          message: this.message,
          code: this.code,
          status: this.status,
          ...(this.metadata && { metadata: this.metadata }),
          ...(isDevelopment && { stack: this.stack }),
        },
      },
      {
        status: this.status,
      }
    )
  }
}

/**
 * Factory function to create custom error classes
 *
 * @param options - Error configuration
 * @returns A custom error class that can be instantiated
 *
 * @example
 * ```typescript
 * // Create the error class
 * const SubscriptionNotFoundError = createCustomError({
 *   message: "Subscription not found",
 *   code: "SUBSCRIPTION_NOT_FOUND",
 *   status: 404
 * })
 *
 * // Register with Elysia
 * new Elysia()
 *   .error({ SubscriptionNotFoundError })
 *   .onError(({ code, error }) => {
 *     if (code === "SubscriptionNotFoundError") {
 *       return error.toResponse()
 *     }
 *   })
 *   .get("/subscription/:id", () => {
 *     throw new SubscriptionNotFoundError()
 *   })
 * ```
 */
export function createCustomError(options: CustomErrorOptions) {
  return class extends CustomError {
    constructor(overrides?: Partial<CustomErrorOptions>) {
      super({
        message: overrides?.message ?? options.message,
        code: overrides?.code ?? options.code,
        status: overrides?.status ?? options.status,
        metadata: overrides?.metadata ?? options.metadata,
      })
    }
  }
}

/**
 * Helper to create multiple error classes at once
 *
 * @param errors - Object mapping error names to error options
 * @returns Object with error classes
 *
 * @example
 * ```typescript
 * const SubscriptionErrors = createErrorClasses({
 *   NotFound: {
 *     message: "Subscription not found",
 *     code: "SUBSCRIPTION_NOT_FOUND",
 *     status: 404
 *   },
 *   CreateFailed: {
 *     message: "Failed to create subscription",
 *     code: "SUBSCRIPTION_CREATE_FAILED",
 *     status: 500
 *   }
 * })
 *
 * // Use them
 * throw new SubscriptionErrors.NotFound()
 * ```
 */
export function createErrorClasses<
  T extends Record<string, CustomErrorOptions>,
>(
  errors: T
): {
  [K in keyof T]: ReturnType<typeof createCustomError>
} {
  const result = {} as {
    [K in keyof T]: ReturnType<typeof createCustomError>
  }

  for (const [name, options] of Object.entries(errors)) {
    result[name as keyof T] = createCustomError(options) as any
  }

  return result
}

export function invariant(
  condition: boolean,
  message: string
): asserts condition {
  if (!condition) {
    throw new CustomError({
      message,
      code: "INVARIANT_ERROR",
      status: 500,
    })
  }
}
