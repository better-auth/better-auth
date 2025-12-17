// https://github.com/nodejs/node/blob/360f7cc7867b43344aac00564286b895e15f21d7/lib/internal/errors.js#L246C1-L261C2
function isErrorStackTraceLimitWritable() {
	const desc = Object.getOwnPropertyDescriptor(Error, "stackTraceLimit");
	if (desc === undefined) {
		return Object.isExtensible(Error);
	}

	return Object.prototype.hasOwnProperty.call(desc, "writable")
		? desc.writable
		: desc.set !== undefined;
}

/**
 * Hide internal stack frames from the error stack trace.
 */
export function hideInternalStackFrames(stack: string): string {
	const lines = stack.split("\n    at ");
	if (lines.length <= 1) {
		return stack;
	}
	lines.splice(1, 1);
	return lines.join("\n    at ");
}

// https://github.com/nodejs/node/blob/360f7cc7867b43344aac00564286b895e15f21d7/lib/internal/errors.js#L411-L432
/**
 * Creates a custom error class that hides stack frames.
 */
export function makeErrorForHideStackFrame<
	B extends new (
		...args: any[]
	) => Error,
>(
	Base: B,
	clazz: any,
): {
	new (
		...args: ConstructorParameters<B>
	): InstanceType<B> & { errorStack: string | undefined };
} {
	class HideStackFramesError extends Base {
		#hiddenStack: string | undefined;

		constructor(...args: any[]) {
			if (isErrorStackTraceLimitWritable()) {
				const limit = Error.stackTraceLimit;
				Error.stackTraceLimit = 0;
				super(...args);
				Error.stackTraceLimit = limit;
			} else {
				super(...args);
			}
			const stack = new Error().stack;
			if (stack) {
				this.#hiddenStack = hideInternalStackFrames(
					stack.replace(/^Error/, this.name),
				);
			}
		}

		// use `getter` here to avoid the stack trace being captured by loggers
		get errorStack() {
			return this.#hiddenStack;
		}
	}

	// This is a workaround for wpt tests that expect that the error
	// constructor has a `name` property of the base class.
	Object.defineProperty(HideStackFramesError.prototype, "constructor", {
		get() {
			return clazz;
		},
		enumerable: false,
		configurable: true,
	});

	return HideStackFramesError as any;
}

export const statusCodes = {
	OK: 200,
	CREATED: 201,
	ACCEPTED: 202,
	NO_CONTENT: 204,
	MULTIPLE_CHOICES: 300,
	MOVED_PERMANENTLY: 301,
	FOUND: 302,
	SEE_OTHER: 303,
	NOT_MODIFIED: 304,
	TEMPORARY_REDIRECT: 307,
	BAD_REQUEST: 400,
	UNAUTHORIZED: 401,
	PAYMENT_REQUIRED: 402,
	FORBIDDEN: 403,
	NOT_FOUND: 404,
	METHOD_NOT_ALLOWED: 405,
	NOT_ACCEPTABLE: 406,
	PROXY_AUTHENTICATION_REQUIRED: 407,
	REQUEST_TIMEOUT: 408,
	CONFLICT: 409,
	GONE: 410,
	LENGTH_REQUIRED: 411,
	PRECONDITION_FAILED: 412,
	PAYLOAD_TOO_LARGE: 413,
	URI_TOO_LONG: 414,
	UNSUPPORTED_MEDIA_TYPE: 415,
	RANGE_NOT_SATISFIABLE: 416,
	EXPECTATION_FAILED: 417,
	"I'M_A_TEAPOT": 418,
	MISDIRECTED_REQUEST: 421,
	UNPROCESSABLE_ENTITY: 422,
	LOCKED: 423,
	FAILED_DEPENDENCY: 424,
	TOO_EARLY: 425,
	UPGRADE_REQUIRED: 426,
	PRECONDITION_REQUIRED: 428,
	TOO_MANY_REQUESTS: 429,
	REQUEST_HEADER_FIELDS_TOO_LARGE: 431,
	UNAVAILABLE_FOR_LEGAL_REASONS: 451,
	INTERNAL_SERVER_ERROR: 500,
	NOT_IMPLEMENTED: 501,
	BAD_GATEWAY: 502,
	SERVICE_UNAVAILABLE: 503,
	GATEWAY_TIMEOUT: 504,
	HTTP_VERSION_NOT_SUPPORTED: 505,
	VARIANT_ALSO_NEGOTIATES: 506,
	INSUFFICIENT_STORAGE: 507,
	LOOP_DETECTED: 508,
	NOT_EXTENDED: 510,
	NETWORK_AUTHENTICATION_REQUIRED: 511,
};

export type Status =
	| 100
	| 101
	| 102
	| 103
	| 200
	| 201
	| 202
	| 203
	| 204
	| 205
	| 206
	| 207
	| 208
	| 226
	| 300
	| 301
	| 302
	| 303
	| 304
	| 305
	| 306
	| 307
	| 308
	| 400
	| 401
	| 402
	| 403
	| 404
	| 405
	| 406
	| 407
	| 408
	| 409
	| 410
	| 411
	| 412
	| 413
	| 414
	| 415
	| 416
	| 417
	| 418
	| 421
	| 422
	| 423
	| 424
	| 425
	| 426
	| 428
	| 429
	| 431
	| 451
	| 500
	| 501
	| 502
	| 503
	| 504
	| 505
	| 506
	| 507
	| 508
	| 510
	| 511;

class InternalAPIError extends Error {
	constructor(
		public status: keyof typeof statusCodes | Status = "INTERNAL_SERVER_ERROR",
		public body:
			| ({
					message?: string;
					code?: string;
					cause?: unknown;
			  } & Record<string, any>)
			| undefined = undefined,
		public headers: HeadersInit = {},
		public statusCode = typeof status === "number"
			? status
			: statusCodes[status],
	) {
		super(
			body?.message,
			body?.cause
				? {
						cause: body.cause,
					}
				: undefined,
		);
		this.name = "APIError";
		this.status = status;
		this.headers = headers;
		this.statusCode = statusCode;
		this.body = body
			? {
					code: body?.message
						?.toUpperCase()
						.replace(/ /g, "_")
						.replace(/[^A-Z0-9_]/g, ""),
					...body,
				}
			: undefined;
	}
}
export type APIError = InstanceType<typeof InternalAPIError>;
export const APIError = makeErrorForHideStackFrame(InternalAPIError, Error);
