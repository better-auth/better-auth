import type {
	EndpointContext,
	EndpointOptions,
	StandardSchemaV1,
	StrictEndpoint,
} from "better-call";
import {
	createEndpoint,
	createMiddleware,
	kAPIErrorHeaderSymbol,
} from "better-call";
import { runWithEndpointContext } from "../context";
import type { AuthContext } from "../types";
import { isAPIError } from "../utils/is-api-error";

/**
 * Better-call's createEndpoint re-throws APIError without exposing the headers
 * accumulated on ctx.responseHeaders (e.g. Set-Cookie from deleteSessionCookie
 * before throw). Attach them to the error via kAPIErrorHeaderSymbol — matching
 * better-call's createMiddleware contract so the outer pipeline can merge them
 * into the response.
 */
function attachResponseHeadersToAPIError(
	responseHeaders: Headers | undefined,
	e: unknown,
): void {
	if (!isAPIError(e) || !responseHeaders) return;
	Object.defineProperty(e, kAPIErrorHeaderSymbol, {
		enumerable: false,
		configurable: true,
		value: responseHeaders,
		writable: false,
	});
}

export const optionsMiddleware = createMiddleware(async () => {
	/**
	 * This will be passed on the instance of
	 * the context. Used to infer the type
	 * here.
	 */
	return {} as AuthContext;
});

export const createAuthMiddleware = createMiddleware.create({
	use: [
		optionsMiddleware,
		/**
		 * Only use for post hooks
		 */
		createMiddleware(async () => {
			return {} as {
				returned?: unknown | undefined;
				responseHeaders?: Headers | undefined;
			};
		}),
	],
});

const use = [optionsMiddleware];

/**
 * Better Auth extensions to better-call's EndpointOptions. These fields are
 * read by the OpenAPI plugin and pass through better-call's spread untouched.
 */
export interface AuthEndpointExtras {
	/**
	 * Schema for the successful 200 response body. Drives OpenAPI `responses` and
	 * (when `openAPI({ validateResponses: true })` is set) dev-time handler
	 * output validation.
	 */
	response?: StandardSchemaV1;
	/**
	 * Error codes this handler may throw via `APIError`. Drives the
	 * non-2xx entries of OpenAPI `responses`.
	 */
	errors?: readonly string[];
}

export type AuthEndpointOptions = EndpointOptions & AuthEndpointExtras;

type EndpointHandler<
	Path extends string,
	Options extends AuthEndpointOptions,
	R,
> = (context: EndpointContext<Path, Options, AuthContext>) => Promise<R>;

export function createAuthEndpoint<
	Path extends string,
	Options extends AuthEndpointOptions,
	R,
>(
	path: Path,
	options: Options,
	handler: EndpointHandler<Path, Options, R>,
): StrictEndpoint<Path, Options, R>;

export function createAuthEndpoint<
	Path extends string,
	Options extends AuthEndpointOptions,
	R,
>(
	options: Options,
	handler: EndpointHandler<Path, Options, R>,
): StrictEndpoint<Path, Options, R>;

export function createAuthEndpoint<
	Path extends string,
	Opts extends AuthEndpointOptions,
	R,
>(
	pathOrOptions: Path | Opts,
	handlerOrOptions: EndpointHandler<Path, Opts, R> | Opts,
	handlerOrNever?: any,
) {
	const path: Path | undefined =
		typeof pathOrOptions === "string" ? pathOrOptions : undefined;
	const options: Opts =
		typeof handlerOrOptions === "object"
			? handlerOrOptions
			: (pathOrOptions as Opts);
	const handler: EndpointHandler<Path, Opts, R> =
		typeof handlerOrOptions === "function" ? handlerOrOptions : handlerOrNever;

	// todo: prettify the code, we want to call `runWithEndpointContext` to top level
	const wrapped: EndpointHandler<Path, Opts, R> = async (ctx) => {
		const runtimeCtx = ctx as unknown as { responseHeaders?: Headers };
		try {
			return await runWithEndpointContext(ctx as any, () => handler(ctx));
		} catch (e) {
			attachResponseHeadersToAPIError(runtimeCtx.responseHeaders, e);
			throw e;
		}
	};

	if (path) {
		return createEndpoint(
			path,
			{
				...options,
				use: [...(options?.use || []), ...use],
			},
			wrapped,
		);
	}

	return createEndpoint(
		{
			...options,
			use: [...(options?.use || []), ...use],
		},
		wrapped,
	);
}

export type AuthEndpoint<
	Path extends string,
	Opts extends AuthEndpointOptions,
	R,
> = ReturnType<typeof createAuthEndpoint<Path, Opts, R>>;
export type AuthMiddleware = ReturnType<typeof createAuthMiddleware>;
