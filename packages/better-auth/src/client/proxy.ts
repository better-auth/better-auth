import type { BetterFetch } from "@better-fetch/fetch";
import type { PreinitializedWritableAtom } from "nanostores";
import type { ProxyRequest } from "./path-to-object";
import type { LiteralUnion } from "../types/helper";

function getMethod(
	path: string,
	knownPathMethods: Record<string, "POST" | "GET">,
	args?: ProxyRequest,
) {
	const method = knownPathMethods[path];
	const { options, query, ...body } = args || {};
	if (method) {
		return method;
	}
	if (options?.method) {
		return options.method;
	}
	if (body && Object.keys(body).length > 0) {
		return "POST";
	}
	return "GET";
}

export type AuthProxySignal = {
	atom: LiteralUnion<string, "$sessionSignal">;
	matcher: (path: string) => boolean;
};

export function createDynamicPathProxy<T extends Record<string, any>>(
	routes: T,
	client: BetterFetch,
	knownPathMethods: Record<string, "POST" | "GET">,
	$signal?: AuthProxySignal[],
	$signals?: Record<string, PreinitializedWritableAtom<boolean>>,
): T {
	function createProxy(path: string[] = []): any {
		return new Proxy(function () {}, {
			get(target, prop: string) {
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

				return createProxy(fullPath);
			},
			apply: async (_, __, args) => {
				const routePath =
					"/" +
					path
						.map((segment) =>
							segment.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`),
						)
						.join("/");

				const arg = (args[0] || {}) as ProxyRequest;
				const method = getMethod(routePath, knownPathMethods, arg);
				const { query, options, ...body } = arg;

				return await client(routePath, {
					...options,
					body: method === "GET" ? undefined : body,
					query: query,
					method,
					async onSuccess(context) {
						const signal = $signal?.find((s) => s.matcher(routePath));
						if (!signal) return;
						const signalAtom = $signals?.[signal.atom];
						if (!signalAtom) return;
						signalAtom.set(!signalAtom.get());
						await options?.onSuccess?.(context);
					},
				});
			},
		});
	}

	return createProxy() as T;
}
