import type { BetterAuthClientOptions } from "@better-auth/core";
import type { BASE_ERROR_CODES } from "@better-auth/core/error";
import { capitalizeFirstLetter } from "@better-auth/core/utils/string";
import type {
	BetterFetchError,
	BetterFetchResponse,
} from "@better-fetch/fetch";
import type { DeepReadonly, Ref } from "vue";
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
import { useStore } from "./vue-store";

function getAtomKey(str: string) {
	return `use${capitalizeFirstLetter(str)}`;
}

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
										: never]: () => DeepReadonly<
									Ref<ReturnType<Atoms[key]["get"]>>
								>;
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

type VueUseSession<Option extends BetterAuthClientOptions> = {
	(): DeepReadonly<
		Ref<{
			data: ClientSession<Option>;
			isPending: boolean;
			isRefetching: boolean;
			error: BetterFetchError | null;
			refetch: (
				queryParams?: { query?: SessionQueryParams } | undefined,
			) => Promise<void>;
		}>
	>;
	<F extends (...args: any) => any>(
		useFetch: F,
	): Promise<{
		data: Ref<ClientSession<Option>>;
		isPending: false;
		error: Ref<{
			message?: string | undefined;
			status: number;
			statusText: string;
		}>;
	}>;
};

/**
 * Vue client returned by `createAuthClient`.
 */
export type VueAuthClient<Option extends BetterAuthClientOptions> =
	UnionToIntersection<InferResolvedHooks<Option>> &
		InferClientAPI<Option> &
		InferActions<Option> & {
			useSession: VueUseSession<Option>;
			$Infer: {
				Session: NonNullable<ClientSession<Option>>;
			};
			$fetch: ClientConfig["$fetch"];
			$store: ClientConfig["$store"];
			$ERROR_CODES: PrettifyDeep<
				InferErrorCodes<Option> & typeof BASE_ERROR_CODES
			>;
		};

export function createAuthClient<Option extends BetterAuthClientOptions>(
	options?: Option | undefined,
): VueAuthClient<Option> {
	const {
		baseURL,
		pluginPathMethods,
		pluginsActions,
		pluginsAtoms,
		$fetch,
		$store,
		atomListeners,
	} = getClientConfig(options, false);
	const resolvedHooks: Record<string, any> = {};
	for (const [key, value] of Object.entries(pluginsAtoms)) {
		resolvedHooks[getAtomKey(key)] = () => useStore(value);
	}

	function useSession(): DeepReadonly<
		Ref<{
			data: ClientSession<Option>;
			isPending: boolean;
			isRefetching: boolean;
			error: BetterFetchError | null;
			refetch: (
				queryParams?: { query?: SessionQueryParams } | undefined,
			) => Promise<void>;
		}>
	>;
	function useSession<F extends (...args: any) => any>(
		useFetch: F,
	): Promise<{
		data: Ref<ClientSession<Option>>;
		isPending: false; //this is just to be consistent with the default hook
		error: Ref<{
			message?: string | undefined;
			status: number;
			statusText: string;
		}>;
	}>;
	function useSession<UseFetch extends <_T>(...args: any) => any>(
		useFetch?: UseFetch | undefined,
	) {
		if (useFetch) {
			const ref = useStore(pluginsAtoms.$sessionSignal!);
			return useFetch(`${baseURL}/get-session`, {
				ref,
			}).then((res: any) => {
				return {
					data: res.data,
					isPending: false,
					error: res.error,
				};
			});
		}
		return resolvedHooks.useSession();
	}

	const routes = {
		...pluginsActions,
		...resolvedHooks,
		useSession,
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

	return proxy as VueAuthClient<Option>;
}

export type * from "@better-fetch/fetch";
export type * from "nanostores";
export type * from "../../types/helper";
export type { UnionToIntersection } from "../../types/helper";
