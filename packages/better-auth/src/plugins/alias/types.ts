import type { BetterAuthPlugin } from "packages/core/dist";
import type { CamelCase } from "../../client/path-to-object";
import type { AliasOptions } from ".";
import type { Endpoint } from "better-call";
import type { SpecialEndpoints } from "./utils";

export type NormalizePrefix<S extends string> = S extends ""
	? ""
	: S extends "/"
		? ""
		: S extends `/${infer Rest}`
			? Rest extends `${infer Inner}/`
				? `/${Inner}`
				: `/${Rest}`
			: S extends `${infer Inner}/`
				? `/${Inner}`
				: `/${S}`;

export type TransformNormalizedPrefix<T extends string> =
	T extends `${infer Head}/${infer Tail}`
		? `${Head}-${TransformNormalizedPrefix<Tail>}`
		: T;

export type TrimLeadingChar<
	S extends string,
	C extends string = "-",
> = S extends `${C}${infer T}` ? T : S;

export type CamelCasePrefix<Prefix extends string> = CamelCase<
	TrimLeadingChar<TransformNormalizedPrefix<NormalizePrefix<Prefix>>>
>;

export type TransformEndpointKey<
	K extends string,
	Prefix extends string,
> = `${CamelCasePrefix<Prefix>}${Capitalize<K>}`;

export type MatchesExcluded<
	OldPath extends string,
	ExcludePath extends string[] | undefined,
> = ExcludePath extends string[]
	? OldPath extends ExcludePath[number]
		? true
		: false
	: false;

export type InferAliasedPlugin_base<
	Prefix extends string,
	T extends BetterAuthPlugin,
	O extends AliasOptions,
	IsClient extends boolean = false,
> = Omit<T, "endpoints" | "$Infer"> & {
	endpoints: {
		[K in keyof T["endpoints"] &
			string as O["prefixEndpointMethods"] extends true
			? TransformEndpointKey<K, Prefix>
			: K]: IsClient extends false
			? T["endpoints"][K]
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
				: T["endpoints"][K];
	};
} & (T extends { $Infer: infer I extends Record<string, any> }
		? {
				$Infer: O["prefixTypeInference"] extends true
					? {
							[K in keyof I &
								string as `${Capitalize<CamelCasePrefix<Prefix>>}${K}`]: I[K];
						}
					: I;
			}
		: {
				$Infer: undefined;
			});
