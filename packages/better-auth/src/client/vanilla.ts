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
import type { Atom } from "nanostores";
import type { PrettifyDeep, UnionToIntersection } from "../types/helper";
import { getClientConfig } from "./config";
import { createDynamicPathProxy } from "./proxy";
import type {
	InferActions,
	InferClientAPI,
	InferErrorCodes,
	IsSignal,
} from "./types";

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
										: never]: Atoms[key];
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
	return proxy as UnionToIntersection<InferResolvedHooks<Option>> &
		ClientAPI &
		InferActions<Option> & {
			useSession: Atom<{
				data: Session;
				error: BetterFetchError | null;
				isPending: boolean;
			}>;
			$fetch: typeof $fetch;
			$store: typeof $store;
			$Infer: {
				Session: NonNullable<Session>;
			};
			$ERROR_CODES: PrettifyDeep<
				InferErrorCodes<Option> & typeof BASE_ERROR_CODES
			>;
		};
}

export type AuthClient<Option extends BetterAuthClientOptions> = ReturnType<
	typeof createAuthClient<Option>
>;
