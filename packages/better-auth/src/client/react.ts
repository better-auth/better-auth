import { useStore } from "@nanostores/react";
import { getClientConfig } from "./config";
import { capitalizeFirstLetter } from "../utils/misc";
import type {
	AuthClientPlugin,
	ClientOptions,
	InferActions,
	InferClientAPI,
	IsSignal,
} from "./types";
import { createDynamicPathProxy } from "./proxy";
import { getSessionAtom } from "./session-atom";
import type { UnionToIntersection } from "../types/helper";
import { useEffect, useState } from "react";

function getAtomKey(str: string) {
	return `use${capitalizeFirstLetter(str)}`;
}

type InferResolvedHooks<O extends ClientOptions> = O["plugins"] extends Array<
	infer Plugin
>
	? Plugin extends AuthClientPlugin
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
	const { $session, _sessionSignal, $infer } = getSessionAtom<Option>($fetch);

	type InitialValue = ReturnType<(typeof $session)["get"]>["data"] | null;
	function useSession(initialValue?: InitialValue) {
		const [isClient, setIsClient] = useState(false);
		const storeValue = useStore($session);

		useEffect(() => {
			setIsClient(true);
		}, []);

		if (!isClient && initialValue !== undefined) {
			return {
				data: initialValue || undefined,
				loading: false,
				error: undefined,
				promise: () => Promise.resolve(),
			} as unknown as typeof storeValue;
		}
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
			$infer: typeof $infer;
		};
}

export const useAuthQuery = useStore;
