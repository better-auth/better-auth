import { useStore } from "@nanostores/vue";
import type { DeepReadonly, Ref } from "vue";
import { getClientConfig } from "./config";
import { capitalizeFirstLetter } from "../utils/misc";
import type {
	BetterAuthClientPlugin,
	ClientOptions,
	InferActions,
	InferClientAPI,
	InferSessionFromClient,
	InferUserFromClient,
	IsSignal,
} from "./types";
import { createDynamicPathProxy } from "./proxy";
import type { UnionToIntersection } from "../types/helper";
import type { BetterFetchError } from "@better-fetch/fetch";

function getAtomKey(str: string) {
	return `use${capitalizeFirstLetter(str)}`;
}

type InferResolvedHooks<O extends ClientOptions> = O["plugins"] extends Array<
	infer Plugin
>
	? Plugin extends BetterAuthClientPlugin
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
	: {};

export function createAuthClient<Option extends ClientOptions>(
	options?: Option,
) {
	const {
		pluginPathMethods,
		pluginsActions,
		pluginsAtoms,
		$fetch,
		$store,
		atomListeners,
	} = getClientConfig(options);
	let resolvedHooks: Record<string, any> = {};
	for (const [key, value] of Object.entries(pluginsAtoms)) {
		resolvedHooks[getAtomKey(key)] = () => useStore(value);
	}

	type Session = {
		session: InferSessionFromClient<Option>;
		user: InferUserFromClient<Option>;
	};

	function useSession(): () => DeepReadonly<
		Ref<{
			data: Session | null;
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
			message?: string;
			status: number;
			statusText: string;
		}>;
	}>;
	function useSession<UseFetch extends <T>(...args: any) => any>(
		useFetch?: UseFetch,
	) {
		if (useFetch) {
			const ref = useStore(pluginsAtoms.$sessionSignal);
			const baseURL = options?.fetchOptions?.baseURL || options?.baseURL;
			const authPath = baseURL ? new URL(baseURL).pathname : "/api/auth";
			return useFetch(`${authPath}/get-session`, {
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
				Session: Session;
			};
			$fetch: typeof $fetch;
			$store: typeof $store;
		};
}
