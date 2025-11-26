import type { Endpoint, InputContext } from "better-call";
import type { PrettifyDeep, UnionToIntersection } from "../types/helper";

export type FilteredAPI<API> = Omit<
	API,
	API extends { [key in infer K]: Endpoint }
		? K extends string
			? K extends "getSession"
				? K
				: API[K]["options"]["metadata"] extends { isAction: false }
					? K
					: never
			: never
		: never
>;

export type FilterActions<API> = Omit<
	API,
	API extends { [key in infer K]: Endpoint }
		? K extends string
			? API[K]["options"]["metadata"] extends { isAction: false }
				? K
				: never
			: never
		: never
>;

export type InferSessionAPI<API> = API extends {
	[key: string]: infer E;
}
	? UnionToIntersection<
			E extends Endpoint
				? E["path"] extends "/get-session"
					? {
							getSession: <
								R extends boolean,
								H extends boolean = false,
							>(context: {
								headers: Headers;
								query?:
									| {
											disableCookieCache?: boolean;
											disableRefresh?: boolean;
									  }
									| undefined;
								asResponse?: R | undefined;
								returnHeaders?: H | undefined;
							}) => false extends R
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

/**
 * Extracts the actual return type from an endpoint handler.
 * Handles the case where endpoints return data wrapped or unwrapped.
 */
type InferEndpointReturnType<E> = E extends (...args: any[]) => Promise<infer R>
	? R extends { response: infer Data }
		? Data
		: R
	: never;

/**
 * Transforms an endpoint to have correct TypeScript types for server-side API calls.
 * The default return type (without asResponse) should be the actual data, not Response.
 */
type TransformEndpoint<E> = E extends Endpoint<
	infer Path,
	infer Options,
	infer Handler
>
	? {
			<
				AsResponse extends boolean = false,
				ReturnHeaders extends boolean = false,
				ReturnStatus extends boolean = false,
			>(
				context?: InputContext<Path, Options> & {
					asResponse?: AsResponse;
					returnHeaders?: ReturnHeaders;
					returnStatus?: ReturnStatus;
				},
			): AsResponse extends true
				? Promise<Response>
				: ReturnHeaders extends true
					? ReturnStatus extends true
						? Promise<{
								headers: Headers;
								status: number;
								response: Awaited<InferEndpointReturnType<Handler>>;
							}>
						: Promise<{
								headers: Headers;
								response: Awaited<InferEndpointReturnType<Handler>>;
							}>
					: ReturnStatus extends true
						? Promise<{
								status: number;
								response: Awaited<InferEndpointReturnType<Handler>>;
							}>
						: Promise<Awaited<InferEndpointReturnType<Handler>>>;
			options: Options;
			path: Path;
		}
	: E;

/**
 * Transforms all endpoints in an API to have correct return types.
 * Excludes 'getSession' since it has special handling in InferSessionAPI.
 */
type TransformAPI<API> = {
	[K in keyof API as K extends "getSession" ? never : K]: TransformEndpoint<
		API[K]
	>;
};

export type InferAPI<API> = InferSessionAPI<API> & TransformAPI<API>;
