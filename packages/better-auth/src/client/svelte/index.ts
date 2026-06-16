import type { BetterAuthClientOptions } from "@better-auth/core";
import type { BASE_ERROR_CODES } from "@better-auth/core/error";
import { capitalizeFirstLetter } from "@better-auth/core/utils/string";
import type {
	BetterFetchError,
	BetterFetchResponse,
} from "@better-fetch/fetch";
import type { Atom } from "nanostores";
import type { PrettifyDeep, UnionToIntersection } from "../../types/helper";
import { getClientConfig } from "../config";
import { createDynamicPathProxy } from "../proxy";
import type {
	InferActions,
	InferClientAPI,
	InferErrorCodes,
	IsSignal,
	SessionQueryParams,
} from "../types";

type InferResolvedHooks<O extends BetterAuthClientOptions> = O extends {
	plugins: Array<infer Plugin>;
}
	? UnionToIntersection<
			Plugin extends {
				getAtoms?: infer GetAtoms;
			}
				? GetAtoms extends (fetch: any) => infer Atoms
					? Atoms extends Record<string, any>
						? {
								[key in keyof Atoms as IsSignal<key> extends true
									? never
									: key extends string
										? `use${Capitalize<key>}`
										: never]: () => Atoms[key];
							}
						: {}
					: {}
				: {}
		>
	: {};

type ClientConfig = ReturnType<typeof getClientConfig>;
type ClientSession<Option extends BetterAuthClientOptions> =
	InferClientAPI<Option> extends {
		getSession: () => Promise<infer Res>;
	}
		? Res extends BetterFetchResponse<infer S>
			? S
			: Res extends Record<string, any>
				? Res
				: never
		: never;

/**
 * Svelte client returned by `createAuthClient`.
 */
export type SvelteAuthClient<Option extends BetterAuthClientOptions> =
	UnionToIntersection<InferResolvedHooks<Option>> &
		InferClientAPI<Option> &
		InferActions<Option> & {
			useSession: () => Atom<{
				data: ClientSession<Option>;
				error: BetterFetchError | null;
				isPending: boolean;
				isRefetching: boolean;
				refetch: (
					queryParams?: { query?: SessionQueryParams } | undefined,
				) => Promise<void>;
			}>;
			$fetch: ClientConfig["$fetch"];
			$store: ClientConfig["$store"];
			$Infer: {
				Session: NonNullable<ClientSession<Option>>;
			};
			$ERROR_CODES: PrettifyDeep<
				InferErrorCodes<Option> & typeof BASE_ERROR_CODES
			>;
		};

export function createAuthClient<Option extends BetterAuthClientOptions>(
	options?: Option | undefined,
): SvelteAuthClient<Option> {
	const {
		pluginPathMethods,
		pluginsActions,
		pluginsAtoms,
		$fetch,
		atomListeners,
		$store,
	} = getClientConfig(options);
	const resolvedHooks: Record<string, any> = {};
	for (const [key, value] of Object.entries(pluginsAtoms)) {
		resolvedHooks[`use${capitalizeFirstLetter(key)}`] = () => value;
	}
	const routes = {
		...pluginsActions,
		...resolvedHooks,
		$fetch,
		$store,
	};
	const proxy = createDynamicPathProxy(
		routes,
		$fetch,
		pluginPathMethods,
		pluginsAtoms,
		atomListeners,
	);
	return proxy as SvelteAuthClient<Option>;
}

export type * from "@better-fetch/fetch";
export type * from "nanostores";
export type * from "../../types/helper";
export type { UnionToIntersection } from "../../types/helper";
