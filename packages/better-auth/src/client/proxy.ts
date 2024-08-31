import type { BetterFetch } from "@better-fetch/fetch";
import type { PreinitializedWritableAtom } from "nanostores";
import type { ProxyRequest } from "./path-to-object";
import type { LiteralUnion } from "type-fest";

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
	const handler: ProxyHandler<any> = {
		get(target, prop: string) {
			// If the property exists in the initial object, return it directly
			if (prop in routes) {
				return routes[prop as string];
			}
			return new Proxy(() => {}, {
				get: (_, nestedProp: string) => {
					//@ts-expect-error
					return handler.get(target, `${prop}.${nestedProp}`);
				},
				apply: async (_, __, args) => {
					if (prop in target) {
						return target[prop](...args);
					}
					const path = prop
						.split(".")
						.map((segment) =>
							segment.replace(/[A-Z]/g, (letter) => `-${letter.toLowerCase()}`),
						)
						.join("/");
					const routePath = `/${path}`;
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
							/**
							 * call if options.onSuccess
							 * is passed since we are
							 * overriding onSuccess
							 */
							await options?.onSuccess?.(context);
						},
					});
				},
			});
		},
	};
	return new Proxy(routes, handler);
}
