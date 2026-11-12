import type {
	BetterAuthClientPlugin,
	ClientAtomListener,
	ClientFetchOption,
} from "@better-auth/core";
import { toKebabCase } from "@better-auth/core/utils/string";
import type { BetterFetch, SuccessContext } from "@better-fetch/fetch";
import { isPayloadMethod } from "@better-fetch/fetch";
import type { Atom } from "nanostores";
import { isAtom } from "../utils/is-atom";
import type { ProxyRequest } from "./path-to-object";

export function createDynamicPathProxy<T extends Record<string, any>>(
	routes: T,
	client: BetterFetch,
	knownPathMethods: Record<string, "POST" | "GET">,
	atoms: Record<string, Atom>,
	atomListeners: BetterAuthClientPlugin["atomListeners"],
): T {
	function createProxy(path: string[] = []): any {
		return new Proxy(function () {}, {
			get(_, prop) {
				if (typeof prop !== "string") {
					return undefined;
				}
				if (prop === "then" || prop === "catch" || prop === "finally") {
					return undefined;
				}
				const fullPath = [...path, prop];
				let current: any = routes;
				for (const segment of fullPath) {
					if (current && typeof current === "object" && segment in current) {
						current = current[segment];
					} else {
						current = undefined;
						break;
					}
				}
				if (typeof current === "function") {
					return current;
				}
				if (isAtom(current)) {
					return current;
				}
				return createProxy(fullPath);
			},
			apply: async (_, __, args) => {
				const routePath = "/" + path.map(toKebabCase).join("/");
				const arg = (args[0] || {}) as ProxyRequest;
				const fetchOptions = (args[1] || {}) as ClientFetchOption;
				const { query, fetchOptions: argFetchOptions, ...body } = arg;
				const options = {
					...fetchOptions,
					...argFetchOptions,
				} as ClientFetchOption;
				const method =
					knownPathMethods[routePath] ||
					options.method ||
					(Object.keys(body).length > 0 ? "POST" : "GET");
				let successContext: SuccessContext | undefined;
				const result = await client(routePath, {
					...options,
					body: isPayloadMethod(method)
						? {
								...body,
								...(options?.body || {}),
							}
						: undefined,
					query: query || options?.query,
					method,
					onSuccess(context) {
						successContext = context;
					},
				});
				if (!successContext) return result;

				// Signal only after every fetch plugin hook ran, so cookies they persist
				// are sent by the refetch, and before onSuccess, so it sees the auth change.
				const matches =
					atomListeners && !options.disableSignal
						? atomListeners.filter((s) => s.matcher(routePath))
						: [];
				const visited = new Set<ClientAtomListener["signal"]>();
				for (const match of matches) {
					const signal = atoms[match.signal as any];
					if (!signal || visited.has(match.signal)) {
						continue;
					}
					visited.add(match.signal);
					//@ts-expect-error
					signal.set(!signal.get());
					// we also call the callback if it exists
					match.callback?.(routePath);
				}
				await options?.onSuccess?.(successContext);
				return result;
			},
		});
	}
	return createProxy() as T;
}
