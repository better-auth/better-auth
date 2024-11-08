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
import type { Atom } from "nanostores";
import type { BetterFetchError } from "@better-fetch/fetch";

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
								: never]: Atoms[key];
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
		$store,
	} = getClientConfig(options);
	let resolvedHooks: Record<string, any> = {};
	for (const [key, value] of Object.entries(pluginsAtoms)) {
		resolvedHooks[`use${capitalizeFirstLetter(key)}`] = value;
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
	return proxy as UnionToIntersection<InferResolvedHooks<Option>> &
		InferClientAPI<Option> &
		InferActions<Option> & {
			useSession: Atom<{
				data: {
					session: InferSessionFromClient<Option>;
					user: InferUserFromClient<Option>;
				};
				error: BetterFetchError | null;
				isPending: boolean;
			}>;
			$fetch: typeof $fetch;
			$store: typeof $store;
			$Infer: {
				Session: {
					session: InferSessionFromClient<Option>;
					user: InferUserFromClient<Option>;
				};
			};
		};
}
