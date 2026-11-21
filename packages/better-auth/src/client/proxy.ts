import type {
	BetterAuthClientPlugin,
	ClientAtomListener,
	ClientFetchOption,
} from "@better-auth/core";
import { toKebabCase } from "@better-auth/core/utils/string";
import type { BetterFetch, BetterFetchPlugin } from "@better-fetch/fetch";
import { isPayloadMethod } from "@better-fetch/fetch";
import type { WritableAtom } from "nanostores";
import { isAtom } from "../utils/is-atom";
import { beginAuthChange, classifyAuthChange } from "./auth-change";
import type { ProxyRequest } from "./path-to-object";

export function createDynamicPathProxy<T extends Record<string, any>>(
	routes: T,
	client: BetterFetch,
	knownPathMethods: Record<string, "POST" | "GET">,
	atoms: Record<string, WritableAtom<unknown>>,
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
				/**
				 * We trigger listeners
				 */
				const matches: {
					listener: ClientAtomListener;
					signal: WritableAtom<unknown>;
				}[] = [];
				for (const listener of options.disableSignal
					? []
					: atomListeners || []) {
					if (!listener.matcher(routePath)) continue;
					const signal = atoms[listener.signal as string];
					if (!signal) break;
					if (matches.some((match) => match.signal === signal)) continue;
					matches.push({ listener, signal });
				}
				let ends: (() => Promise<void>)[] | undefined;
				const authChange: BetterFetchPlugin = {
					id: "auth-change",
					name: "auth-change",
					hooks: {
						// Start before success hooks persist the new credentials.
						onResponse(context) {
							if (ends || !context.response.ok) return;
							// Signing out cannot start a session.
							const change =
								routePath === "/sign-out"
									? "data"
									: classifyAuthChange(
											atoms,
											matches.map(({ listener }) => listener.signal as string),
										);
							ends = matches.flatMap(({ signal }) =>
								beginAuthChange(signal, change),
							);
						},
						// Run after the hooks that persist credentials, so a throwing
						// callback cannot skip them.
						async onSuccess(context) {
							await options.onSuccess?.(context);
						},
					},
				};
				try {
					return await client(routePath, {
						...options,
						body: isPayloadMethod(method)
							? {
									...body,
									...(options?.body || {}),
								}
							: undefined,
						query: query || options?.query,
						method,
						onSuccess: undefined,
						plugins: [...(options.plugins || []), authChange],
					});
				} finally {
					if (ends) {
						const settled = ends.map((end) => end());
						// Signal after every success hook, so the refetch sends the new credentials.
						for (const { signal } of matches) {
							signal.set(!signal.get());
						}
						// Resolve the call only after the bound atoms reflect the change.
						await Promise.all(settled);
						for (const { listener } of matches) {
							// we also call the callback if it exists
							listener.callback?.(routePath);
						}
					}
				}
			},
		});
	}
	return createProxy() as T;
}
