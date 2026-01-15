import type {
	EndpointBaseOptions,
	EndpointBodyMethodOptions,
	EndpointContext,
	EndpointOptions,
	StrictEndpoint,
} from "better-call";
import { createEndpoint, createMiddleware } from "better-call";
import { runWithEndpointContext } from "../context";
import type { AuthContext } from "../types";

/**
 * Extended endpoint options for Better Auth endpoints.
 */
export type AuthEndpointOptions = EndpointBaseOptions &
	EndpointBodyMethodOptions & {
		metadata?: {
			[key: string]: unknown;
		};
	};

export type AuthEndpointContext<
	Path extends string,
	Options extends AuthEndpointOptions,
	Context = {},
> = EndpointContext<Path, Options, Context>;

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
	Options extends AuthEndpointOptions,
	R,
> = (context: AuthEndpointContext<Path, Options, AuthContext>) => Promise<R>;

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

	if (path) {
		return createEndpoint(
			path,
			{
				...options,
				use: [...(options?.use || []), ...use],
			},
			// todo: prettify the code, we want to call `runWithEndpointContext` to top level
			async (ctx) => runWithEndpointContext(ctx as any, () => handler(ctx)),
		);
	}

	return createEndpoint(
		{
			...options,
			use: [...(options?.use || []), ...use],
		},
		// todo: prettify the code, we want to call `runWithEndpointContext` to top level
		async (ctx) =>
			runWithEndpointContext(ctx as any, () => handler(ctx as any)),
	);
}

export type AuthEndpoint<
	Path extends string,
	Opts extends EndpointOptions,
	R,
> = ReturnType<typeof createAuthEndpoint<Path, Opts, R>>;
export type AuthMiddleware = ReturnType<typeof createAuthMiddleware>;
