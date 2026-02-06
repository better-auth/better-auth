import type { StandardSchemaV1 } from "@standard-schema/spec";
import type {
	EndpointBodyMethodOptions,
	EndpointContext,
	EndpointOptions,
	StrictEndpoint,
} from "better-call";
import { createEndpoint, createMiddleware } from "better-call";
import type { output } from "zod";
import { runWithEndpointContext } from "../context";
import type { AuthContext } from "../types";

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

type ExtractInferredMetadata<E extends EndpointOptions> = E extends {
	metadata: infer M;
}
	? {
			metadata: {
				[K in keyof M]: K extends "$Infer"
					? {
							[P in keyof M[K]]: M[K][P] extends StandardSchemaV1<infer S>
								? StandardSchemaV1<S>
								: M[K][P] extends output<infer T>
									? T
									: M[K][P];
						}
					: M[K];
			};
		}
	: {};

//#region Copy from better-call
type ExtractBody<E extends EndpointBodyMethodOptions> = E extends {
	method: ("POST" | "PUT" | "DELETE" | "PATCH" | "GET" | "HEAD")[];
	body?: StandardSchemaV1<infer B>;
}
	? E extends {
			method: infer M;
			body?: StandardSchemaV1<B>;
		}
		? { method: M; body: StandardSchemaV1<B> }
		: never
	: E extends {
				method:
					| "POST"
					| "PUT"
					| "DELETE"
					| "PATCH"
					| ("POST" | "PUT" | "DELETE" | "PATCH")[];
				body?: StandardSchemaV1<infer B>;
			}
		? E extends {
				method: infer M;
				body?: StandardSchemaV1<B>;
			}
			? { method: M; body: StandardSchemaV1<B> }
			: never
		: E extends {
					method: "*";
					body?: StandardSchemaV1<infer B>;
				}
			? {
					method: "*";
					body?: StandardSchemaV1<B>;
				}
			: E extends {
						method: "GET" | "HEAD" | ("GET" | "HEAD")[];
						body?: never;
					}
				? E extends { method: infer M }
					? { method: M }
					: never
				: never;
type ExtractError<E extends EndpointOptions> = E extends {
	error?: StandardSchemaV1<infer Err>;
}
	? {
			error: StandardSchemaV1<Err>;
		}
	: {};
type ExtractQuery<E extends EndpointOptions> = E extends {
	query?: StandardSchemaV1<infer Q>;
}
	? {
			query: StandardSchemaV1<Q>;
		}
	: {};

type ExtractOthers<E extends EndpointOptions> = Pick<
	E,
	Exclude<keyof E, "method" | "body" | "query" | "error" | "metadata">
>;

type PrettifyEndpointOptions<E extends EndpointOptions> = ExtractOthers<E> &
	ExtractBody<E> &
	ExtractQuery<E> &
	ExtractError<E> &
	ExtractInferredMetadata<E>;
//#endregion

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
): StrictEndpoint<Path, PrettifyEndpointOptions<Options>, R>;

export function createAuthEndpoint<
	Path extends string,
	Options extends EndpointOptions,
	R,
>(
	options: Options,
	handler: EndpointHandler<Path, Options, R>,
): StrictEndpoint<Path, PrettifyEndpointOptions<Options>, R>;

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

	if (path) {
		return createEndpoint(
			path,
			{
				...options,
				use: [...(options?.use || []), ...use],
			},
			// todo: prettify the code, we want to call `runWithEndpointContext` to top level
			async (ctx) =>
				runWithEndpointContext(ctx as any, () => handler(ctx as any)),
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
