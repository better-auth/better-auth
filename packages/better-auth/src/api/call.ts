import {
	type Context,
	type ContextTools,
	type Endpoint,
	type EndpointOptions,
	type EndpointResponse,
	type InferUse,
	type InferRequest,
	type InferBody,
	type InferHeaders,
	type Prettify,
	type Handler,
	createEndpoint,
	createMiddleware,
} from "better-call";
import type { AuthContext } from "../init";
import type { BetterAuthOptions } from "../types/options";

export const createMiddlewareCreator = <
	E extends {
		use?: Endpoint[];
	},
>(
	opts?: E,
) => {
	type H<Opts extends EndpointOptions, R extends EndpointResponse> = (
		ctx: Prettify<
			InferBody<Opts> &
				InferUse<E["use"]> &
				InferRequest<Opts> &
				InferHeaders<Opts> & {
					params?: Record<string, string>;
					query?: Record<string, string>;
				} & ContextTools
		>,
	) => Promise<R>;
	function fn<Opts extends EndpointOptions, R extends EndpointResponse>(
		optionsOrHandler: H<Opts, R>,
	): Endpoint<Handler<string, Opts, R>, Opts>;
	function fn<
		Opts extends Omit<EndpointOptions, "method">,
		R extends EndpointResponse,
	>(
		optionsOrHandler: Opts,
		handler: H<
			Opts & {
				method: "*";
			},
			R
		>,
	): Endpoint<
		Handler<
			string,
			Opts & {
				method: "*";
			},
			R
		>,
		Opts & {
			method: "*";
		}
	>;
	function fn(optionsOrHandler: any, handler?: any) {
		if (typeof optionsOrHandler === "function") {
			return createEndpoint(
				"*",
				{
					method: "*",
				},
				optionsOrHandler,
			);
		}
		if (!handler) {
			throw new Error("Middleware handler is required");
		}
		const endpoint = createEndpoint(
			"*",
			{
				...optionsOrHandler,
				method: "*",
			},
			handler,
		);
		return endpoint as any;
	}
	return fn;
};

export function createEndpointCreator<
	E extends {
		use?: Endpoint[];
	},
>(opts?: E) {
	return <
		Path extends string,
		Opts extends EndpointOptions,
		R extends EndpointResponse,
	>(
		path: Path,
		options: Opts,
		handler: (
			ctx: Prettify<
				Context<Path, Opts> &
					InferUse<Opts["use"]> &
					InferUse<E["use"]> &
					Omit<ContextTools, "_flag">
			>,
		) => Promise<R>,
	) => {
		return createEndpoint(
			path,
			{
				...options,
				use: [...(options?.use || []), ...(opts?.use || [])],
			},
			handler,
		);
	};
}

export const optionsMiddleware = createMiddleware(async () => {
	/**
	 * This will be passed on the instance of
	 * the context. Used to infer the type
	 * here.
	 */
	return {} as AuthContext;
});

export const createAuthMiddleware = createMiddlewareCreator({
	use: [
		optionsMiddleware,
		/**
		 * Only use for post hooks
		 */
		createMiddleware(async () => {
			return {} as {
				returned?: Response;
			};
		}),
	],
});

export const createAuthEndpoint = createEndpointCreator({
	use: [optionsMiddleware],
});

export type AuthEndpoint = Endpoint<
	(ctx: {
		options: BetterAuthOptions;
		body: any;
		query: any;
		params: any;
		headers: Headers;
	}) => Promise<EndpointResponse>
>;

export type AuthMiddleware = ReturnType<typeof createAuthMiddleware>;
