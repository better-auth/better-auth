import type {
	BetterAuthClientOptions,
	BetterAuthClientPlugin,
} from "@better-auth/core";
import type { BASE_ERROR_CODES } from "@better-auth/core/error";
import type {
	BetterFetchError,
	BetterFetchResponse,
} from "@better-fetch/fetch";
import type { PrettifyDeep, UnionToIntersection } from "better-auth/types/helper";
import { getClientConfig } from "@better-auth/client/config";
import { createDynamicPathProxy } from "@better-auth/client/proxy";
import type {
	InferActions,
	InferClientAPI,
	InferErrorCodes,
	IsSignal,
	SessionQueryParams,
} from "@better-auth/client/types";
import { useStore } from "./store";

function getAtomKey(str: string) {
	return `use${capitalizeFirstLetter(str)}`;
}

export function capitalizeFirstLetter(str: string) {
	return str.charAt(0).toUpperCase() + str.slice(1);
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
										: never]: () => ReturnType<Atoms[key]["get"]>;
							}
						: {}
					: {}
				: {}
		>
	: {};

export function createAuthClient<Option extends BetterAuthClientOptions>(
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
			: Res
		: never;
	return proxy as UnionToIntersection<InferResolvedHooks<Option>> &
		ClientAPI &
		InferActions<Option> & {
			useSession: () => {
				data: Session;
				isPending: boolean;
				error: BetterFetchError | null;
				refetch: (queryParams?: { query?: SessionQueryParams }) => void;
			};
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

export { useStore };
export type * from "@better-fetch/fetch";
export type * from "nanostores";
