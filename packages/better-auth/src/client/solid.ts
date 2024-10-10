import { useStore } from "@nanostores/solid";
import { getClientConfig } from "./config";
import { createDynamicPathProxy } from "./proxy";
import { capitalizeFirstLetter } from "../utils/misc";
import type {
	BetterAuthClientPlugin,
	ClientOptions,
	InferActions,
	InferClientAPI,
	IsSignal,
} from "./types";
import type { Accessor } from "solid-js";
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
								: never]: () => Accessor<ReturnType<Atoms[key]["get"]>>;
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

	function useSession() {
		return useStore($session);
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
