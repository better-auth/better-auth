import { useStore } from "@nanostores/solid";
import { getClientConfig } from "./config";
import { createDynamicPathProxy } from "./proxy";
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
import type { Accessor } from "solid-js";
import { getSessionAtom } from "./session-atom";
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
	const routes = {
		...pluginsActions,
		...resolvedHooks,
	};
	const proxy = createDynamicPathProxy(
		routes,
		$fetch,
		pluginPathMethods,
		pluginsAtoms,
		atomListeners,
	);
	type Session = {
		session: InferSessionFromClient<Option>;
		user: InferUserFromClient<Option>;
	};
	return proxy as UnionToIntersection<InferResolvedHooks<Option>> &
		InferClientAPI<Option> &
		InferActions<Option> & {
			useSession: () => Accessor<{
				data: Session | null;
				isPending: boolean;
				isRefetching: boolean;
				error: BetterFetchError | null;
			}>;
			$Infer: {
				Session: Session;
			};
			$fetch: typeof $fetch;
		};
}
