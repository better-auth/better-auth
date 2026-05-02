import type {
	BetterAuthClientOptions,
	BetterAuthClientPlugin,
} from "@better-auth/core";
import type { BASE_ERROR_CODES } from "@better-auth/core/error";
import { capitalizeFirstLetter } from "@better-auth/core/utils/string";
import type {
	BetterFetchError,
	BetterFetchResponse,
} from "@better-fetch/fetch";
import type { UnionToIntersection } from "../../types/helper";
import { getClientConfig } from "../config";
import { createDynamicPathProxy } from "../proxy";
import type {
	InferActions,
	InferClientAPI,
	InferErrorCodes,
	IsSignal,
	SessionQueryParams,
} from "../types";
import type { UIProxy } from "../ui";
import { useStore } from "./react-store";

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
										: never]: () => ReturnType<Atoms[key]["get"]>;
							}
						: {}
					: {}
				: {}
		>
	: {};

type InferPlugins<O extends BetterAuthClientOptions> = O extends {
	plugins: infer P;
}
	? P extends BetterAuthClientPlugin[]
		? P
		: []
	: [];

export function createAuthClient<Option extends BetterAuthClientOptions>(
	options?: Option | undefined,
) {
	const {
		pluginPathMethods,
		pluginsActions,
		pluginsAtoms,
		$fetch,
		$store,
		atomListeners,
		ui,
	} = getClientConfig(options);
	const resolvedHooks: Record<string, any> = {};
	for (const [key, value] of Object.entries(pluginsAtoms)) {
		resolvedHooks[getAtomKey(key)] = () => useStore(value);
	}

	const routes = {
		...pluginsActions,
		...resolvedHooks,
		$fetch,
		$store,
		atomListeners,
		ui,
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
				isRefetching: boolean;
				error: BetterFetchError | null;
				refetch: (
					queryParams?: { query?: SessionQueryParams } | undefined,
				) => Promise<void>;
			};
			$Infer: {
				Session: NonNullable<Session>;
			};
			$fetch: typeof $fetch;
			$store: typeof $store;
			atomListeners: typeof atomListeners;
			$ERROR_CODES: InferErrorCodes<Option> & typeof BASE_ERROR_CODES;
			ui: UIProxy<InferPlugins<Option>>;
		};
}

export { useStore };
export type * from "@better-fetch/fetch";
export type * from "nanostores";
export type * from "../../types/helper";
export type { UnionToIntersection } from "../../types/helper";
export type { AtomListener } from "../auth-iframe";
export type { AuthProps } from "./Auth";
export { Auth } from "./Auth";
