import { useStore } from "@nanostores/react";
import { getClientConfig } from "./config";

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

export function capitalizeFirstLetter(str: string) {
	return str.charAt(0).toUpperCase() + str.slice(1);
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
								: never]: () => ReturnType<Atoms[key]["get"]>;
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

	type InitialValue = ReturnType<(typeof $session)["get"]>["data"] | null;
	function useSession(initialValue?: InitialValue) {
		const storeValue = useStore($session);
		return storeValue;
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

export const useAuthQuery = useStore;
