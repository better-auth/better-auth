import { BetterFetchOption } from "@better-fetch/fetch";
import { createBaseClient } from "./base";

function fromCamelCase(str: string) {
	const path = str
		.split(/(?=[A-Z])/)
		.join("/")
		.toLowerCase();
	return `/${path}`;
}

/**
 * Handles edge cases like signInCredential and
 * signUpCredential
 */
function handleEdgeCases(str: string) {
	const splits = str.split("/");
	if (splits[0] === "sign" && (splits[1] === "in" || splits[1] === "up")) {
		splits[1] === "in" ? "signIn" : "signUp";
	}
	return splits.join("/");
}

export function getProxy(actions: Record<string, any>, client: any) {
	return new Proxy(actions, {
		get(target, key) {
			if (key in target) {
				return target[key as keyof typeof actions];
			}
			return (args?: BetterFetchOption) => {
				key = fromCamelCase(key as string);
				key = handleEdgeCases(key);
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
