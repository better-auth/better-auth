import type {
	EndpointHandler,
	EndpointOptions,
	MiddlewareHandler,
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
 * Response headers that forbid any intermediary (proxy, CDN, browser) from
 * caching a response body. Credential-bearing responses (access/refresh tokens,
 * ID tokens, client secrets, device codes) must carry them.
 *
 * Set `metadata: { noStore: true }` on an endpoint and {@link createAuthEndpoint}
 * applies these to the responses its handler produces: the success body and any
 * error the handler throws. A request rejected by schema or media-type
 * validation before the handler runs is not covered, and carries no credentials
 * to protect. Spread them into a hand-built `Response` or `APIError`'s headers
 * for the rare endpoint that constructs its own response.
 *
 * @see https://datatracker.ietf.org/doc/html/rfc6749#section-5.1
 */
export const NO_STORE_HEADERS = {
	"Cache-Control": "no-store",
	Pragma: "no-cache",
} as const;

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

const createEndpointWithAuthContext = createEndpoint.create({
	use: [optionsMiddleware],
});

type AuthEndpointHandler<
	Path extends string,
	Options extends EndpointOptions,
	R,
> = EndpointHandler<Path, Options, R, AuthContext>;

type PathlessAuthEndpointHandler<
	Options extends EndpointOptions,
	R,
> = AuthEndpointHandler<string, Options, R>;

function wrapEndpointHandler<
	Path extends string,
	Options extends EndpointOptions,
	R,
>(
	handler: AuthEndpointHandler<Path, Options, R>,
	options: Options,
): AuthEndpointHandler<Path, Options, R> {
	const noStore =
		(options as { metadata?: { noStore?: boolean } }).metadata?.noStore ===
		true;

	return async (context) => {
		if (noStore) {
			for (const [name, value] of Object.entries(NO_STORE_HEADERS)) {
				context.setHeader(name, value);
			}
		}
		try {
			return await runWithEndpointContext(context, () => handler(context));
		} catch (error) {
			attachResponseHeadersToAPIError(context.responseHeaders, error);
			throw error;
		}
	};
}

export function createAuthEndpoint<
	Path extends string,
	Options extends EndpointOptions,
	R,
>(
	path: Path,
	options: Options,
	handler: AuthEndpointHandler<Path, Options, R>,
): StrictEndpoint<Path, Options, R>;

export function createAuthEndpoint<
	InferredPath extends string,
	Options extends EndpointOptions,
	R,
>(
	options: Options,
	handler: PathlessAuthEndpointHandler<Options, R>,
): StrictEndpoint<InferredPath, Options, R>;

export function createAuthEndpoint<
	Path extends string,
	Options extends EndpointOptions,
	R,
>(
	...args:
		| [
				path: Path,
				options: Options,
				handler: AuthEndpointHandler<Path, Options, R>,
		  ]
		| [options: Options, handler: PathlessAuthEndpointHandler<Options, R>]
) {
	if (args.length === 3) {
		const [path, options, handler] = args;
		return createEndpointWithAuthContext(
			path,
			options,
			wrapEndpointHandler(handler, options),
		);
	}

	const [options, handler] = args;
	return createEndpointWithAuthContext(
		options,
		wrapEndpointHandler(handler, options),
	);
}

/**
 * Set `metadata.SERVER_ONLY` while preserving any existing metadata
 * (`$Infer`, `openapi`, ...).
 */
function withServerOnly<Options extends EndpointOptions>(
	options: Options,
): Options {
	return {
		...options,
		metadata: { ...options.metadata, SERVER_ONLY: true },
	} as Options;
}

/**
 * Declare a **server-only** endpoint.
 *
 * The endpoint is callable through `auth.api.*` from trusted server code but is
 * never registered on the HTTP router and never emitted into the OpenAPI
 * schema. It takes no path because it has no URL to be reached at.
 *
 * Prefer this over the path-less `createAuthEndpoint({ ... }, handler)` form.
 * Setting `metadata.SERVER_ONLY` makes the intent explicit at the call site and
 * keeps the endpoint off the HTTP surface even if a path is later added by
 * mistake: better-call's router skips an endpoint when its path is missing *or*
 * when `SERVER_ONLY` is set, so the two together are defense in depth. Relying
 * on path omission alone is invisible and one keystroke away from exposure.
 *
 * @example
 * ```ts
 * viewBackupCodes: createAuthEndpoint.serverOnly(
 * 	{ method: "POST", body: schema },
 * 	async (ctx) => { ... },
 * )
 * ```
 */
createAuthEndpoint.serverOnly = <
	InferredPath extends string,
	Options extends EndpointOptions,
	R,
>(
	options: Options,
	handler: PathlessAuthEndpointHandler<Options, R>,
): StrictEndpoint<InferredPath, Options, R> =>
	createAuthEndpoint<InferredPath, Options, R>(
		withServerOnly(options),
		handler,
	);

export type AuthEndpoint<
	Path extends string,
	Opts extends EndpointOptions,
	R,
> = ReturnType<typeof createAuthEndpoint<Path, Opts, R>>;

export type AuthMiddleware = MiddlewareHandler;
