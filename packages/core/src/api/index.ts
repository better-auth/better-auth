import type {
	EndpointContext,
	EndpointOptions,
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

const use = [optionsMiddleware];

type EndpointHandler<
	Path extends string,
	Options extends EndpointOptions,
	R,
> = (context: EndpointContext<Path, Options, AuthContext>) => Promise<R>;

export function createAuthEndpoint<
	Path extends string,
	Options extends EndpointOptions,
	R,
>(
	path: Path,
	options: Options,
	handler: EndpointHandler<Path, Options, R>,
): StrictEndpoint<Path, Options, R>;

export function createAuthEndpoint<
	Path extends string,
	Options extends EndpointOptions,
	R,
>(
	options: Options,
	handler: EndpointHandler<Path, Options, R>,
): StrictEndpoint<Path, Options, R>;

export function createAuthEndpoint<
	Path extends string,
	Opts extends EndpointOptions,
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

	// Endpoints that return credentials declare `metadata: { noStore: true }`.
	// Emit the no-store headers at the boundary, before the handler runs, so they
	// land on every response the handler produces: a success harvests
	// `responseHeaders`, and a thrown error carries the same headers through
	// `attachResponseHeadersToAPIError`. Validation that rejects the request
	// before the handler runs is not covered (and returns no credentials).
	const noStore =
		(options as { metadata?: { noStore?: boolean } }).metadata?.noStore ===
		true;

	// todo: prettify the code, we want to call `runWithEndpointContext` to top level
	const wrapped: EndpointHandler<Path, Opts, R> = async (ctx) => {
		if (noStore) {
			for (const [name, value] of Object.entries(NO_STORE_HEADERS)) {
				ctx.setHeader(name, value);
			}
		}
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

export namespace createAuthEndpoint {
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
	export function serverOnly<
		Path extends string,
		Options extends EndpointOptions,
		R,
	>(
		options: Options,
		handler: EndpointHandler<Path, Options, R>,
	): StrictEndpoint<Path, Options, R> {
		return createAuthEndpoint(withServerOnly(options), handler);
	}
}

export type AuthEndpoint<
	Path extends string,
	Opts extends EndpointOptions,
	R,
> = ReturnType<typeof createAuthEndpoint<Path, Opts, R>>;
export type AuthMiddleware = ReturnType<typeof createAuthMiddleware>;
