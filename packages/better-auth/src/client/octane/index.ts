import type { BetterAuthClientOptions } from "@better-auth/core";
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
import { useStore } from "./react-store";

function getAtomKey(str: string) {
	return `use${capitalizeFirstLetter(str)}`;
}

type InferResolvedHooks<O extends BetterAuthClientOptions> = O extends {
	plugins: Array<infer Plugin>;
}
	? UnionToIntersection<
			Plugin extends {
				getAtoms?: infer GetAtoms;
			}
				? GetAtoms extends (fetch: any) => infer Atoms
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

type ClientConfig = ReturnType<typeof getClientConfig>;
type ClientSession<Option extends BetterAuthClientOptions> =
	InferClientAPI<Option> extends {
		getSession: () => Promise<infer Res>;
	}
		? Res extends BetterFetchResponse<infer S>
			? S
			: Res
		: never;

/**
 * Octane client returned by `createAuthClient`.
 */
export type OctaneAuthClient<Option extends BetterAuthClientOptions> =
	UnionToIntersection<InferResolvedHooks<Option>> &
		InferClientAPI<Option> &
		InferActions<Option> & {
			useSession: () => {
				data: ClientSession<Option>;
				isPending: boolean;
				isRefetching: boolean;
				error: BetterFetchError | null;
				refetch: (
					queryParams?: { query?: SessionQueryParams } | undefined,
				) => Promise<void>;
			};
			$Infer: {
				Session: NonNullable<ClientSession<Option>>;
			};
			$fetch: ClientConfig["$fetch"];
			$store: ClientConfig["$store"];
			$ERROR_CODES: InferErrorCodes<Option> & typeof BASE_ERROR_CODES;
		};

export function createAuthClient<Option extends BetterAuthClientOptions>(
	options?: Option | undefined,
): OctaneAuthClient<Option> {
	const {
		pluginPathMethods,
		pluginsActions,
		pluginsAtoms,
		$fetch,
		$store,
		atomListeners,
	} = getClientConfig(options);
	const resolvedHooks: Record<string, any> = {};
	for (const [key, value] of Object.entries(pluginsAtoms)) {
		// The octane compiler wraps every custom-hook call site
		// (`client.useX(...)`) in `withSlot(sym, hook, ...args, sym)`, appending a
		// per-call-site Symbol as the hook's trailing argument. Accept it and
		// forward it to `useStore` so each generated hook keeps a distinct slot;
		// `useStore` then derives stable child slots for its internal
		// `useRef`/`useCallback`/`useSyncExternalStore` via `subSlot(slot, …)`.
		// Without forwarding, `useStore` runs with `slot === undefined` and its
		// three internal base hooks collapse onto one shared hook-cell.
		resolvedHooks[getAtomKey(key)] = (slot?: symbol) =>
			useStore(value, undefined, slot);
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

	return proxy as OctaneAuthClient<Option>;
}

export { useStore };
export type * from "@better-fetch/fetch";
export type * from "nanostores";
export type * from "../../types/helper";
export type { UnionToIntersection } from "../../types/helper";
