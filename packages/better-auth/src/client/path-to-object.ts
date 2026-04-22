import type {
	BetterAuthClientOptions,
	ClientFetchOption,
} from "@better-auth/core";
import type { SocialProviderList } from "@better-auth/core/social-providers";
import type { BetterFetchResponse } from "@better-fetch/fetch";
import type { Endpoint, InputContext, StandardSchemaV1 } from "better-call";
import type {
	HasRequiredKeys,
	IsAny,
	Prettify,
	UnionToIntersection,
} from "../types/helper";
import type {
	InferAdditionalFromClient,
	InferSessionFromClient,
	InferUserFromClient,
} from "./types";

/**
 * Extract generic OAuth provider IDs from the client options.
 * Supports both `$InferAuth` (server type bridge) and client plugins
 * with `$InferServerPlugin`.
 */
type InferGenericOAuthProviderIds<O extends BetterAuthClientOptions> =
	| (O extends { $InferAuth: { options: { plugins: Array<infer P> } } }
			? P extends {
					id: "generic-oauth";
					options: { config: Array<{ providerId: infer ID }> };
				}
				? ID & string
				: never
			: never)
	| (O extends { plugins: Array<infer P> }
			? P extends {
					$InferServerPlugin: {
						id: "generic-oauth";
						options: { config: Array<{ providerId: infer ID }> };
					};
				}
				? ID & string
				: never
			: never);

type KeepNullishFromOriginal<Original, Replaced> =
	| Replaced
	| (undefined extends Original ? undefined : never)
	| (null extends Original ? null : never);

type ReplaceTopLevelField<
	Data,
	Field extends "user" | "session",
	Replaced,
> = Data extends object
	? Field extends keyof Data
		? Omit<Data, Field> & {
				[K in Field]: KeepNullishFromOriginal<Data[K], Replaced>;
			}
		: Data
	: Data;

type ReplaceAuthUserAndSession<
	Data,
	ClientOpts extends BetterAuthClientOptions,
> = ReplaceTopLevelField<
	ReplaceTopLevelField<Data, "user", InferUserFromClient<ClientOpts>>,
	"session",
	InferSessionFromClient<ClientOpts>
>;

type MergeCustomSessionField<
	R extends object,
	Field extends "user" | "session",
	InferType,
> = Field extends keyof R
	? {
			[K in Field]: KeepNullishFromOriginal<
				R[K],
				NonNullable<R[K]> & InferType
			>;
		}
	: {};

type MergeCustomSessionWithInferred<
	R,
	ClientOpts extends BetterAuthClientOptions,
> = R extends object
	? Omit<R, "user" | "session"> &
			MergeCustomSessionField<R, "user", InferUserFromClient<ClientOpts>> &
			MergeCustomSessionField<R, "session", InferSessionFromClient<ClientOpts>>
	: never;

type RefineAuthResponse<
	Data,
	ClientOpts extends BetterAuthClientOptions,
> = Data extends { token: unknown } | { redirect: unknown }
	? // Only auth-like responses should get client-side user/session type refinement.
		ReplaceAuthUserAndSession<Data, ClientOpts>
	: Data;

export type CamelCase<S extends string> =
	S extends `${infer P1}-${infer P2}${infer P3}`
		? `${Lowercase<P1>}${Uppercase<P2>}${CamelCase<P3>}`
		: Lowercase<S>;

export type PathToObject<
	T extends string,
	Fn extends (...args: any[]) => any,
> = T extends `/${infer Segment}/${infer Rest}`
	? { [K in CamelCase<Segment>]: PathToObject<`/${Rest}`, Fn> }
	: T extends `/${infer Segment}`
		? { [K in CamelCase<Segment>]: Fn }
		: never;

export type InferSignUpEmailCtx<
	ClientOpts extends BetterAuthClientOptions,
	FetchOptions extends ClientFetchOption,
> = {
	email: string;
	name: string;
	password: string;
	image?: string | undefined;
	callbackURL?: string | undefined;
	fetchOptions?: FetchOptions | undefined;
} & UnionToIntersection<InferAdditionalFromClient<ClientOpts, "user", "input">>;

export type InferUserUpdateCtx<
	ClientOpts extends BetterAuthClientOptions,
	FetchOptions extends ClientFetchOption,
> = {
	image?: (string | null) | undefined;
	name?: string | undefined;
	fetchOptions?: FetchOptions | undefined;
} & Partial<
	UnionToIntersection<InferAdditionalFromClient<ClientOpts, "user", "input">>
>;

type InferCtxQuery<
	C extends InputContext<any, any>,
	FetchOptions extends ClientFetchOption,
> =
	C["query"] extends Record<string, any>
		? {
				query: C["query"];
				fetchOptions?: FetchOptions | undefined;
			}
		: C["query"] extends Record<string, any> | undefined
			? {
					query?: C["query"] | undefined;
					fetchOptions?: FetchOptions | undefined;
				}
			: {
					fetchOptions?: FetchOptions | undefined;
				};

export type InferCtx<
	C extends InputContext<any, any>,
	FetchOptions extends ClientFetchOption,
> =
	IsAny<C["body"]> extends true
		? InferCtxQuery<C, FetchOptions>
		: C["body"] extends Record<string, any>
			? C["body"] & {
					fetchOptions?: FetchOptions | undefined;
				}
			: InferCtxQuery<C, FetchOptions>;

export type MergeRoutes<T> = UnionToIntersection<T>;

export type InferRoute<API, COpts extends BetterAuthClientOptions> =
	API extends Record<string, infer T>
		? T extends Endpoint
			? T["options"]["metadata"] extends
					| {
							isAction: false;
					  }
					| {
							SERVER_ONLY: true;
					  }
					| {
							scope: "http";
					  }
					| {
							scope: "server";
					  }
				? {}
				: PathToObject<
						T["path"],
						T extends (ctx: infer C) => infer R
							? C extends InputContext<any, any>
								? <
										FetchOptions extends ClientFetchOption<
											Partial<C["body"]> & Record<string, any>,
											Partial<C["query"]> & Record<string, any>,
											C["params"]
										>,
									>(
										...data: HasRequiredKeys<
											InferCtx<C, FetchOptions>
										> extends true
											? [
													Prettify<
														T["path"] extends `/sign-up/email`
															? InferSignUpEmailCtx<COpts, FetchOptions>
															: T["path"] extends `/sign-in/social`
																? Omit<
																		InferCtx<C, FetchOptions>,
																		"provider"
																	> & {
																		provider:
																			| SocialProviderList[number]
																			| InferGenericOAuthProviderIds<COpts>
																			| (string & {});
																		fetchOptions?: FetchOptions | undefined;
																	}
																: InferCtx<C, FetchOptions>
													>,
													FetchOptions?,
												]
											: [
													Prettify<
														T["path"] extends `/update-user`
															? InferUserUpdateCtx<COpts, FetchOptions>
															: InferCtx<C, FetchOptions>
													>?,
													FetchOptions?,
												]
									) => Promise<
										BetterFetchResponse<
											T["options"]["metadata"] extends {
												CUSTOM_SESSION: boolean;
											}
												? MergeCustomSessionWithInferred<
														NonNullable<Awaited<R>>,
														COpts
													>
												: T["path"] extends "/get-session"
													? {
															user: InferUserFromClient<COpts>;
															session: InferSessionFromClient<COpts>;
														} | null
													: RefineAuthResponse<NonNullable<Awaited<R>>, COpts>,
											T["options"]["error"] extends StandardSchemaV1
												? // InferOutput
													NonNullable<
														T["options"]["error"]["~standard"]["types"]
													>["output"]
												: {
														code?: string | undefined;
														message?: string | undefined;
													},
											FetchOptions["throw"] extends true
												? true
												: COpts["fetchOptions"] extends { throw: true }
													? true
													: false
										>
									>
								: never
							: never
					>
			: {}
		: never;

export type InferRoutes<
	API extends Record<string, unknown>,
	ClientOpts extends BetterAuthClientOptions,
> = MergeRoutes<InferRoute<API, ClientOpts>>;

export type ProxyRequest = {
	options?: ClientFetchOption<any, any> | undefined;
	query?: any | undefined;
	[key: string]: any;
};
