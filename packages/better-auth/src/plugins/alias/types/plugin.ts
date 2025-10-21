import type { BetterAuthPlugin } from "@better-auth/core";
import type { AliasOptions } from "..";
import type { AliasCompatOptions } from "../compat";
import type { Endpoint, Middleware } from "better-call";
import type { SpecialEndpoints } from "../utils";
import type {
	CamelCasePrefix,
	MatchesExcluded,
	NormalizePrefix,
	TransformEndpointKey,
	TransformNormalizedPrefix,
} from "./helper";

export type InferAliasedPlugin_base<
	Prefix extends string,
	T extends BetterAuthPlugin,
	O extends AliasOptions,
	IsClient extends boolean = false,
> = Omit<T, "id" | "endpoints" | "middlewares" | "$Infer"> & {
	id: O["modifyId"] extends true
		? `${T["id"]}-${TransformNormalizedPrefix<NormalizePrefix<Prefix>>}`
		: T["id"];
} & ExtendEndpoints<Prefix, T, O, IsClient> &
	ExtendTypeInference<Prefix, T, O> &
	ExtendMiddlewares<Prefix, T, O, IsClient> & {
		"~meta": {
			prefix: NormalizePrefix<Prefix>;
			options: O;
		};
	};

type ExtendEndpoints<
	Prefix extends string,
	T extends BetterAuthPlugin,
	O extends AliasOptions,
	IsClient extends boolean = false,
> = {
	endpoints: {
		[K in keyof T["endpoints"] &
			string as O["prefixEndpointMethods"] extends true
			? TransformEndpointKey<K, Prefix>
			: K]: IsClient extends false
			? T["endpoints"][K] extends infer E extends Endpoint
				? E
				: never
			: T["endpoints"][K] extends Endpoint<
						infer OldPath,
						infer Options,
						infer Handler
					>
				? Handler extends (...args: infer Args) => infer Return
					? ((...args: Args) => Return) & {
							options: Options;
							path: MatchesExcluded<OldPath, O["excludeEndpoints"]> extends true
								? OldPath
								: OldPath extends `${NormalizePrefix<SpecialEndpoints>}/${infer R}`
									? OldPath extends `${infer S}/${R}`
										? `${S}${NormalizePrefix<Prefix>}${NormalizePrefix<R>}`
										: `${NormalizePrefix<Prefix>}${OldPath}`
									: `${NormalizePrefix<Prefix>}${OldPath}`;
						}
					: T
				: never;
	};
};

type ExtendTypeInference<
	Prefix extends string,
	T extends BetterAuthPlugin,
	O extends AliasOptions,
> = T extends { $Infer: infer I extends Record<string, any> }
	? {
			$Infer: O["prefixTypeInference"] extends true
				? {
						[K in keyof I &
							string as `${Capitalize<CamelCasePrefix<Prefix>>}${K}`]: I[K];
					}
				: I;
		}
	: {
			$Infer: never;
		};

type ExtendMiddlewares<
	Prefix extends string,
	T extends BetterAuthPlugin,
	O extends AliasOptions,
	IsClient extends boolean = false,
> = {
	middlewares: T["middlewares"] extends infer M extends {
		path: string;
		middleware: Middleware;
	}[]
		? IsClient extends false
			? {
					[K in keyof M]: M[K] extends {
						path: infer P extends string;
					}
						? Omit<M[K], "path"> & {
								path: P extends Exclude<
									O["excludeEndpoints"],
									undefined
								>[number]
									? O["excludeEndpoints"] extends Array<infer E extends string>
										? [P] extends [E]
											? P
											: `${NormalizePrefix<Prefix>}${P}`
										: `${NormalizePrefix<Prefix>}${P}`
									: `${NormalizePrefix<Prefix>}${P}`;
							}
						: never;
				}
			: T["middlewares"]
		: never;
};

export type InferMeta<AliasedPlugin extends BetterAuthPlugin> =
	AliasedPlugin extends {
		"~meta": {
			prefix: infer P extends string;
			options?: infer O extends AliasOptions;
		};
	}
		? {
				prefix: P;
				options: O;
			}
		: never;

export type InferAliasedPlugin<
	Prefix extends string,
	T extends BetterAuthPlugin,
	O extends AliasOptions,
> = InferAliasedPlugin_base<Prefix, T, O> & {
	compat: <Plugin extends BetterAuthPlugin, Option extends AliasCompatOptions>(
		plugin: Plugin,
		options?: Option,
	) => InferAliasCompatPlugin<
		InferAliasedPlugin_base<Prefix, T, O>,
		Plugin,
		Option
	>;
};

type InferIncludedEndpoints<
	AliasedPlugin extends BetterAuthPlugin,
	O extends AliasCompatOptions,
> =
	| (AliasedPlugin["endpoints"] extends infer E extends Record<
			string,
			{ path: string }
	  >
			? {
					[K in keyof E]: NonNullable<
						InferMeta<AliasedPlugin>["options"]["excludeEndpoints"]
					>[number] extends E[K]["path"]
						? never
						: E[K]["path"];
				}[keyof E]
			: never)
	| (InferMeta<AliasedPlugin>["options"]["includeEndpoints"] extends infer IE extends
			string[]
			? IE[number]
			: never)
	| (O["includeEndpoints"] extends infer IE extends string[]
			? IE[number]
			: never);

export type InferAliasCompatPlugin<
	AliasedPlugin extends BetterAuthPlugin,
	T extends BetterAuthPlugin,
	O extends AliasCompatOptions,
> = Omit<T, "middlewares"> & {
	middlewares: T["middlewares"] extends infer M extends {
		path: string;
		middleware: Middleware;
	}[]
		? {
				[K in keyof M]: Omit<M[K], "path"> & {
					path: M[K]["path"] extends InferIncludedEndpoints<AliasedPlugin, O>
						? `${NormalizePrefix<InferMeta<AliasedPlugin>["prefix"]>}${M[K]["path"]}`
						: M[K]["path"];
				};
			}
		: never;
};
