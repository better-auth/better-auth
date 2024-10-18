import { useStore } from "@nanostores/vue";
import type { DeepReadonly, Ref } from "vue";
import { getClientConfig } from "./config";
import { capitalizeFirstLetter } from "../utils/misc";
import type {
	BetterAuthClientPlugin,
	ClientOptions,
	InferActions,
	InferClientAPI,
	IsSignal,
} from "./types";
import { createDynamicPathProxy } from "./proxy";
import { getSessionAtom } from "./session-atom";
import type { UnionToIntersection } from "../types/helper";

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
		atomListeners,
	} = getClientConfig(options);
	let resolvedHooks: Record<string, any> = {};
	for (const [key, value] of Object.entries(pluginsAtoms)) {
		resolvedHooks[getAtomKey(key)] = () => useStore(value);
	}
	const { $session, _sessionSignal, $Infer } = getSessionAtom<Option>($fetch);

	type Session = ReturnType<typeof $session.get>["data"];

	function useStoreSession() {
		return useStore($session);
	}

	function useSession(): ReturnType<typeof useStoreSession>;
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
			const ref = useStore(_sessionSignal);
			const basePath = options?.baseURL
				? new URL(options.baseURL).pathname
				: "/api/auth";
			const session = useFetch(`${basePath}/session`, {
				ref,
			}).then((res: any) => {
				return {
					data: res.data,
					isPending: false,
					error: res.error,
				};
			});
			return session;
		}
		return useStoreSession();
	}

	const routes = {
		...pluginsActions,
		...resolvedHooks,
		useSession,
	};

	const proxy = createDynamicPathProxy(
		routes,
		$fetch,
		pluginPathMethods,
		{
			...pluginsAtoms,
			_sessionSignal,
		},
		atomListeners,
	);
	return proxy as UnionToIntersection<InferResolvedHooks<Option>> &
		InferClientAPI<Option> &
		InferActions<Option> & {
			useSession: typeof useSession;
			$Infer: typeof $Infer;
			$fetch: typeof $fetch;
		};
}
