import { Endpoint, Prettify } from "better-call";
import { BetterAuth } from "../auth";
import { HasRequiredKeys, UnionToIntersection } from "type-fest";
import {
	BetterFetchOption,
	BetterFetchPlugin,
	BetterFetchResponse,
	createFetch,
} from "@better-fetch/fetch";
import { BetterAuthError } from "../error/better-auth-error";

type InferContext<T> = T extends (ctx: infer Ctx) => any
	? Ctx extends
			| {
					body: infer Body;
			  }
			| {
					params: infer Param;
			  }
		? (Body extends undefined
				? {}
				: {
						body: Body;
					}) &
				(Param extends undefined
					? {}
					: {
							params: Param;
						})
		: never
	: never;

export interface ClientOptions extends BetterFetchOption {}

const redirectPlugin = {
	id: "redirect",
	name: "Redirect",
	hooks: {
		onSuccess(context) {
			if (context.data.url && context.data.redirect) {
				console.log("redirecting to", context.data.url);
			}
		},
	},
} satisfies BetterFetchPlugin;

function inferBaeURL() {
	const url =
		process.env.AUTH_URL ||
		process.env.NEXT_PUBLIC_AUTH_URL ||
		process.env.BETTER_AUTH_URL ||
		process.env.NEXT_PUBLIC_BETTER_AUTH_URL ||
		process.env.VERCEL_URL ||
		process.env.NEXT_PUBLIC_VERCEL_URL;
	if (url) {
		return url;
	}
	if (
		!url &&
		(process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test")
	) {
		return "http://localhost:3000";
	}
	throw new BetterAuthError(
		"Could not infer baseURL from environment variables. Please pass it as an option to the createClient function.",
	);
}

export const createBaseClient = <Auth extends BetterAuth = BetterAuth>(
	options?: ClientOptions,
) => {
	const fetch = createFetch({
		baseURL: options?.baseURL || inferBaeURL(),
		...options,
		plugins: [...(options?.plugins || []), redirectPlugin],
	});

	type API = Auth["api"];
	type Options = API extends {
		[key: string]: infer T;
	}
		? T extends Endpoint
			? {
					[key in T["path"]]: T;
				}
			: {}
		: {};

	type O = Prettify<UnionToIntersection<Options>>;
	return async <OPT extends O, K extends keyof OPT>(
		path: K,
		...options: HasRequiredKeys<InferContext<OPT[K]>> extends true
			? [
					BetterFetchOption<
						InferContext<OPT[K]>["body"],
						any,
						InferContext<OPT[K]>["params"]
					>,
				]
			: [
					BetterFetchOption<
						InferContext<OPT[K]>["body"],
						InferContext<OPT[K]>["params"]
					>?,
				]
	): Promise<
		BetterFetchResponse<
			Awaited<ReturnType<OPT[K] extends Endpoint ? OPT[K] : never>>
		>
	> => {
		const opts = options[0] as {
			params?: Record<string, any>;
			body?: Record<string, any>;
		};
		return (await fetch(path as string, {
			...options[0],
			body: opts.body,
			params: opts.params,
			method: opts.body ? "POST" : "GET",
			onRequest(context) {
				console.log("request", context.url);
			},
		})) as any;
	};
};
