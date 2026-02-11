import type { AuthContext, BetterAuthOptions } from "@better-auth/core";
import type { Endpoint, EndpointOptions } from "better-call";
import type { PrettifyDeep, UnionToIntersection } from "../types/helper";

/**
 * Deep partial type that preserves function types
 */
type DeepPartialContext<T> = T extends (...args: any[]) => any
	? T
	: T extends object
		? { [K in keyof T]?: DeepPartialContext<T[K]> }
		: T;

/**
 * The context input type that users can pass to auth.api calls.
 * This allows users to pass a partial AuthContext to override
 * default context values.
 */
export type APIContextInput<
	Options extends BetterAuthOptions = BetterAuthOptions,
> = {
	/**
	 * Partial auth context to override default values.
	 * Useful for server-side calls where you already have
	 * session data or need to customize the context.
	 *
	 * @example
	 * ```ts
	 * // Pass existing session to avoid database lookup
	 * await auth.api.updateUser({
	 *   body: { name: "New Name" },
	 *   headers: request.headers,
	 *   context: {
	 *     session: existingSession
	 *   }
	 * });
	 * ```
	 */
	context?: DeepPartialContext<AuthContext<Options>>;
};

/**
 * Wraps an endpoint type to add the context input parameter.
 * This preserves all the original endpoint overloads while
 * adding the ability to pass a partial AuthContext.
 */
export type WithContextInput<
	E extends Endpoint,
	Options extends BetterAuthOptions = BetterAuthOptions,
> = E extends {
	(context: infer C & { asResponse: true }): Promise<Response>;
	(context?: infer C): Promise<infer R>;
	options: EndpointOptions;
	path: infer P;
}
	? {
			(
				context: C & { asResponse: true } & APIContextInput<Options>,
			): Promise<Response>;
			(
				context: C & {
					returnHeaders: true;
					returnStatus: true;
				} & APIContextInput<Options>,
			): Promise<{
				headers: Headers;
				status: number;
				response: Awaited<R>;
			}>;
			(
				context: C & {
					returnHeaders: true;
					returnStatus?: false;
				} & APIContextInput<Options>,
			): Promise<{
				headers: Headers;
				response: Awaited<R>;
			}>;
			(
				context: C & {
					returnHeaders?: false;
					returnStatus: true;
				} & APIContextInput<Options>,
			): Promise<{
				status: number;
				response: Awaited<R>;
			}>;
			(context?: C & APIContextInput<Options>): Promise<R>;
			options: E["options"];
			path: P;
		}
	: E;

/**
 * Maps over all endpoints in the API and adds context input to each.
 */
export type AddContextToAPI<
	API,
	Options extends BetterAuthOptions = BetterAuthOptions,
> = {
	[K in keyof API]: API[K] extends Endpoint
		? WithContextInput<API[K], Options>
		: API[K];
};

export type FilteredAPI<
	API,
	Options extends BetterAuthOptions = BetterAuthOptions,
> = AddContextToAPI<
	Omit<
		API,
		API extends { [key in infer K]: Endpoint }
			? K extends string
				? K extends "getSession"
					? never
					: API[K]["options"]["metadata"] extends
								| { isAction: false }
								| { scope: "http" }
						? K
						: never
				: never
			: never
	>,
	Options
>;

export type InferSessionAPI<
	API,
	Options extends BetterAuthOptions = BetterAuthOptions,
> = API extends {
	[key: string]: infer E;
}
	? UnionToIntersection<
			E extends Endpoint
				? E["path"] extends "/get-session"
					? {
							getSession: <R extends boolean, H extends boolean = false>(
								context: {
									headers: Headers;
									query?:
										| {
												disableCookieCache?: boolean;
												disableRefresh?: boolean;
										  }
										| undefined;
									asResponse?: R | undefined;
									returnHeaders?: H | undefined;
								} & APIContextInput<Options>,
							) => false extends R
								? H extends true
									? Promise<{
											headers: Headers;
											response: PrettifyDeep<Awaited<ReturnType<E>>> | null;
										}>
									: Promise<PrettifyDeep<Awaited<ReturnType<E>>> | null>
								: Promise<Response>;
						}
					: never
				: never
		>
	: never;

export type InferAPI<
	API,
	Options extends BetterAuthOptions = BetterAuthOptions,
> = InferSessionAPI<API, Options> & FilteredAPI<API, Options>;
