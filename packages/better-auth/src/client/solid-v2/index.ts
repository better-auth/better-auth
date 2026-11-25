import type { BetterAuthClientOptions } from "@better-auth/core";
import type { BASE_ERROR_CODES } from "@better-auth/core/error";
import { capitalizeFirstLetter } from "@better-auth/core/utils/string";
import type { BetterFetchResponse } from "@better-fetch/fetch";
import type { Accessor } from "solid-js";
import type { PrettifyDeep, UnionToIntersection } from "../../types/helper";
import { getClientConfig } from "../config";
import { createDynamicPathProxy } from "../proxy";
import type { AuthQueryState } from "../query";
import { isAuthQueryStore } from "../query-atom";
import type { InferActions, InferClientAPI, InferErrorCodes } from "../types";
import type { AuthQueryAccessor } from "./auth-query";
import { createAuthQueryHook } from "./auth-query";
import { useStore } from "./solid-store";

/** The hook a plugin atom resolves to: async for auth queries, sync otherwise. */
type ResolvedHook<Value> = [Value] extends [AuthQueryState<infer Data>]
	? (serverValue?: Accessor<Data | null>) => AuthQueryAccessor<Data>
	: () => Accessor<Value>;

type HookFor<SomeAtom> = SomeAtom extends { get(): infer Value }
	? ResolvedHook<Value>
	: never;

/** Atom keys that become hooks; `$`-prefixed keys are internal signals. */
type HookAtomKey<Atoms> = Exclude<Extract<keyof Atoms, string>, `$${string}`>;

type AtomHooks<Atoms> = {
	[Key in HookAtomKey<Atoms> as `use${Capitalize<Key>}`]: HookFor<Atoms[Key]>;
};

type PluginHooks<Plugin> = Plugin extends {
	getAtoms?: (...args: never[]) => infer Atoms;
}
	? AtomHooks<Atoms>
	: Record<never, never>;

type InferResolvedHooks<Option extends BetterAuthClientOptions> =
	Option extends { plugins: Array<infer Plugin> }
		? UnionToIntersection<PluginHooks<Plugin>>
		: Record<never, never>;

type ClientConfig = ReturnType<typeof getClientConfig>;

type UnwrapFetchResponse<Response> =
	Response extends BetterFetchResponse<infer Data> ? Data : Response;

type ClientSession<Option extends BetterAuthClientOptions> =
	InferClientAPI<Option> extends {
		getSession: () => Promise<infer Response>;
	}
		? NonNullable<UnwrapFetchResponse<Response>>
		: never;

/**
 * Solid 2 client returned by `createAuthClient` from `better-auth/solid-v2`.
 */
export type SolidAuthClient<Option extends BetterAuthClientOptions> =
	InferResolvedHooks<Option> &
		InferClientAPI<Option> &
		InferActions<Option> & {
			/**
			 * Seeds the session on the client (for example with a session
			 * fetched by the server) so the first `useSession()` read does not
			 * wait for a request. Has no effect during server rendering.
			 */
			hydrateSession(session: ClientSession<Option> | null): void;
			/**
			 * The current session as an async accessor: `null` when signed out,
			 * suspends to `<Loading>` until the first answer, and throws to
			 * `<Errored>` when a request fails before that first answer.
			 *
			 * @param serverSession - The request's session to render on the
			 * server (for example read by a server function). Without it the
			 * server renders `null`. Ignored in the browser.
			 */
			useSession: (
				serverSession?: Accessor<ClientSession<Option> | null>,
			) => AuthQueryAccessor<ClientSession<Option>>;
			$Infer: {
				Session: ClientSession<Option>;
			};
			$fetch: ClientConfig["$fetch"];
			$store: ClientConfig["$store"];
			$ERROR_CODES: PrettifyDeep<
				InferErrorCodes<Option> & typeof BASE_ERROR_CODES
			>;
		};

function toHookName(atomKey: string): string {
	return `use${capitalizeFirstLetter(atomKey)}`;
}

/**
 * Creates a Better Auth client for Solid 2.
 *
 * Each plugin atom becomes a `use*` hook. Auth queries (`useSession`,
 * `useActiveOrganization`, …) return async accessors that work with
 * `<Loading>`, `<Errored>` and `isPending`; other atoms return plain
 * accessors. Call hooks in a component body or another primitive.
 *
 * @param options - Client options, including plugins.
 * @returns The typed client.
 */
export function createAuthClient<Option extends BetterAuthClientOptions>(
	options?: Option | undefined,
): SolidAuthClient<Option> {
	const {
		pluginPathMethods,
		pluginsActions,
		pluginsAtoms,
		hydrateSession,
		$fetch,
		$store,
		atomListeners,
	} = getClientConfig(options);

	const createHook = (atom: ClientConfig["pluginsAtoms"][string]) => {
		if (isAuthQueryStore(atom)) {
			return createAuthQueryHook(atom);
		}
		return () => useStore(atom);
	};
	const resolvedHooks = Object.fromEntries(
		Object.entries(pluginsAtoms).map(([key, atom]) => [
			toHookName(key),
			createHook(atom),
		]),
	);

	const routes = {
		...pluginsActions,
		...resolvedHooks,
		hydrateSession,
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
	return proxy as SolidAuthClient<Option>;
}

export type * from "@better-fetch/fetch";
export type * from "nanostores";
export type * from "../../types/helper";
// Both re-exports above declare it; pick the helper's, as `better-auth/solid` does.
export type { UnionToIntersection } from "../../types/helper";
export type {
	AuthQueryAccessor,
	AuthQueryAccessorOptions,
	AuthQueryRefetchParams,
} from "./auth-query";
