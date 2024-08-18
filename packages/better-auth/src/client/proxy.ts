import { BetterFetchOption } from "@better-fetch/fetch";
import { createBaseClient } from "./base";

function fromCamelCase(str: string) {
	const path = str
		.split(/(?=[A-Z])/)
		.join("/")
		.toLowerCase();
	return `/${path}`;
}

export function getProxy(actions: Record<string, any>, client: any) {
	return new Proxy(actions, {
		get(target, key) {
			if (key in target) {
				return target[key as keyof typeof actions];
			}
			return (args?: BetterFetchOption) => {
				key = fromCamelCase(key as string);
				if (args?.params) {
					const paramPlaceholder = Object.keys(args?.params)
						.map((key) => `:${key}`)
						.join("/");
					key = paramPlaceholder.length
						? `${key as string}/${paramPlaceholder}`
						: key;
				}
				return client(key as "/signin/oauth", {
					...(args || {}),
					method: args?.body ? "POST" : "GET",
				});
			};
		},
	});
}
