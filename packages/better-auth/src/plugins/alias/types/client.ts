import type {
	BetterAuthClientPlugin,
	BetterAuthPlugin,
	ClientAtomListener,
} from "@better-auth/core";
import type { LiteralString } from "../../../types/helper";
import type { AliasClientOptions, AliasCompatClientOptions } from "../client";
import type { InferAliasedPlugin_base } from "../types/plugin";
import type { SpecialEndpoints } from "../utils";
import type {
	CamelCasePrefix,
	MatchesExcluded,
	NormalizePrefix,
	TransformNormalizedPrefix,
} from "./helper";

type ExtendPathMethods<
	T extends BetterAuthClientPlugin,
	P extends string,
	O extends AliasClientOptions,
> = T extends {
	pathMethods: infer U;
}
	? {
			pathMethods: {
				[K in keyof U as MatchesExcluded<
					K & string,
					O["excludeEndpoints"]
				> extends true
					? K & string
					: `${P}${K & string}`]: U[K];
			};
		}
	: {
			pathMethods: undefined;
		};

type ExtendGetActions<
	T extends BetterAuthClientPlugin,
	P extends string,
	Options extends AliasClientOptions,
> = T extends {
	getActions: (
		fetch: infer F,
		store: infer S,
		options: infer O,
	) => infer Actions;
}
	? {
			getActions: (
				fetch: F,
				store: S,
				options: O,
			) => {
				[T in P as CamelCasePrefix<P>]: {
					[K in keyof Actions & string as K extends
						| "$Infer"
						| CamelCasePrefix<SpecialEndpoints>
						? never
						: K]: Actions[K];
				};
			} & {
				[T in keyof Actions &
					string as T extends CamelCasePrefix<SpecialEndpoints> ? T : never]: {
					[I in CamelCasePrefix<P>]: Actions[T];
				};
			} & (Actions extends {
					$Infer: infer I extends Record<string, any>;
				}
					? {
							$Infer: Options["prefixTypeInference"] extends true
								? {
										[K in keyof I &
											string as `${Capitalize<CamelCasePrefix<P>>}${K}`]: I[K];
									}
								: I;
						}
					: { $Infer: {} });
		}
	: { getActions: undefined };

type ExtendGetAtoms<
	T extends BetterAuthClientPlugin,
	P extends string,
	Options extends AliasClientOptions,
> = T extends {
	getAtoms: (fetch: infer F, options: infer O) => infer Atoms;
}
	? {
			getAtoms: (
				fetch: F,
				options: O,
			) => {
				[K in keyof Atoms & string as Options["prefixAtoms"] extends true
					? `${K}${Capitalize<CamelCasePrefix<P>>}`
					: K]: Atoms[K];
			};
		}
	: {
			getAtoms: undefined;
		};

type ExtendEndpoints<
	T extends BetterAuthClientPlugin,
	Prefix extends string,
	O extends AliasClientOptions,
> = {
	$InferServerPlugin: T["$InferServerPlugin"] extends infer P extends
		BetterAuthPlugin
		? InferAliasedPlugin_base<
				Prefix,
				P,
				{
					// make endpoints distinct
					prefixEndpointMethods: true;
					excludeEndpoints: O["excludeEndpoints"];
				},
				true
			>
		: never;
};

export type InferClientMeta<AliasedPlugin extends BetterAuthClientPlugin> =
	AliasedPlugin extends {
		"~meta": {
			prefix: infer P extends LiteralString;
			options?: infer O extends AliasClientOptions;
			signals: infer S extends LiteralString | null;
		};
	}
		? {
				prefix: P;
				options: O;
				signals: S;
			}
		: never;

export type InferAliasCompatClientPlugin<
	AliasedPlugin extends BetterAuthClientPlugin,
	T extends BetterAuthClientPlugin,
	O extends AliasCompatClientOptions,
> = Omit<T, "atomListeners"> & {
	atomListeners?: () => ClientAtomListener[] | undefined;
};

export type InferAliasedClientPlugin_base<
	Prefix extends LiteralString,
	T extends BetterAuthClientPlugin,
	O extends AliasClientOptions,
> = Omit<
	T,
	| "id"
	| "pathMethods"
	| "getActions"
	| "getAtoms"
	| "atomListeners"
	| "$InferServerPlugin"
> & {
	id: `${T["id"]}-${TransformNormalizedPrefix<NormalizePrefix<Prefix>>}`;
} & ExtendPathMethods<T, NormalizePrefix<Prefix>, O> &
	ExtendGetActions<T, NormalizePrefix<Prefix>, O> &
	ExtendGetAtoms<T, NormalizePrefix<Prefix>, O> &
	ExtendEndpoints<T, NormalizePrefix<Prefix>, O> & {
		"~meta": {
			prefix: NormalizePrefix<Prefix>;
			options: O;
			signals: T["getAtoms"] extends (...args: any[]) => infer R
				?
						| {
								[K in keyof R & string]: K extends `$${string}` ? K : never;
						  }[keyof R & string][]
						| null
				: null;
		};
		atomListeners?: () => ClientAtomListener[] | undefined;
	};

export type InferAliasedClientPlugin<
	Prefix extends LiteralString,
	T extends BetterAuthClientPlugin,
	O extends AliasClientOptions,
> = InferAliasedClientPlugin_base<Prefix, T, O> & {
	compat: <
		Plugin extends BetterAuthClientPlugin,
		Option extends AliasCompatClientOptions,
	>(
		plugin: Plugin,
		options?: Option,
	) => InferAliasCompatClientPlugin<
		InferAliasedClientPlugin_base<Prefix, T, O>,
		Plugin,
		Option
	>;
};
