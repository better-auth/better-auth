import { BetterFetch, BetterFetchOption } from "@better-fetch/fetch";
import { PreinitializedWritableAtom } from "nanostores";

const knownPathMethods: Record<string, "POST" | "GET"> = {
	"/sign-out": "POST",
	"enable/totp": "POST",
	"/two-factor/disable": "POST",
	"/two-factor/enable": "POST",
	"/two-factor/send-otp": "POST",
};

function getMethod(path: string, args?: BetterFetchOption) {
	const method = knownPathMethods[path];
	if (method) {
		return method;
	}
	if (args?.body) {
		return "POST";
	}
	return "GET";
}

export function createDynamicPathProxy<T extends Record<string, any>>(
	routes: T,
	client: BetterFetch,
	$signal?: {
		[key: string]: PreinitializedWritableAtom<boolean>;
	},
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
					return await client(routePath, {
						...args[0],
						method: getMethod(routePath, args[0]),
						onSuccess() {
							const signal = $signal?.[routePath as string];
							if (signal) {
								signal.set(!signal.get());
							}
						},
					});
				},
			});
		},
	};
	return new Proxy(routes, handler);
}
