import type {
	BetterAuthClientOptions,
	BetterAuthClientPlugin,
} from "@better-auth/core";
import type { BASE_ERROR_CODES } from "@better-auth/core/error";
import { capitalizeFirstLetter } from "@better-auth/core/utils";
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
} from "../types";
import { useStore } from "./vue-store";

function getAtomKey(str: string) {
	return `use${capitalizeFirstLetter(str)}`;
}

type InferResolvedHooks<O extends BetterAuthClientOptions> = O extends {
	plugins: Array<infer Plugin>;
}
	? UnionToIntersection<
			Plugin extends BetterAuthClientPlugin
				? Plugin["getAtoms"] extends (fetch: any) => infer Atoms
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

export function createAuthClient<Option extends BetterAuthClientOptions>(
	options?: Option | undefined,
) {
	const {
		baseURL,
		pluginPathMethods,
		pluginsActions,
		pluginsAtoms,
		$fetch,
		$store,
		atomListeners,
	} = getClientConfig(options, false);
	let resolvedHooks: Record<string, any> = {};
	for (const [key, value] of Object.entries(pluginsAtoms)) {
		resolvedHooks[getAtomKey(key)] = () => useStore(value);
	}

	type ClientAPI = InferClientAPI<Option>;
	type Session = ClientAPI extends {
		getSession: () => Promise<infer Res>;
	}
		? Res extends BetterFetchResponse<infer S>
			? S
			: Res extends Record<string, any>
				? Res
				: never
		: never;

	function useSession(): DeepReadonly<
		Ref<{
			data: Session;
			isPending: boolean;
			isRefetching: boolean;
			error: BetterFetchError | null;
		}>
	>;
	function useSession<F extends (...args: any) => any>(
		useFetch: F,
	): Promise<{
		data: Ref<Session>;
		isPending: false; //this is just to be consistent with the default hook
		error: Ref<{
			message?: string | undefined;
			status: number;
			statusText: string;
		}>;
	}>;
	function useSession<UseFetch extends <T>(...args: any) => any>(
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

	return proxy as UnionToIntersection<InferResolvedHooks<Option>> &
		InferClientAPI<Option> &
		InferActions<Option> & {
			useSession: typeof useSession;
			$Infer: {
				Session: NonNullable<Session>;
			};
			$fetch: typeof $fetch;
			$store: typeof $store;
			$ERROR_CODES: PrettifyDeep<
				InferErrorCodes<Option> & typeof BASE_ERROR_CODES
			>;
		};
}

export type * from "@better-fetch/fetch";
export type * from "nanostores";
export type * from "../../types/helper";
export type { UnionToIntersection } from "../../types/helper";
