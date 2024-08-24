import { BetterFetch, BetterFetchOption } from "@better-fetch/fetch";
import { createBaseClient } from "./base";
import { Atom, PreinitializedWritableAtom } from "nanostores";

function fromCamelCase(str: string) {
	const path = str
		.split(/(?=[A-Z])/)
		.join("/")
		.toLowerCase();
	return `/${path}`;
}

const knownCases = [
	["sign", "in"],
	["sign", "up"],
	["sign", "out"],
	["invite", "member"],
	["update", "member"],
	["delete", "member"],
	["accept", "invitation"],
	["reject", "invitation"],
	["cancel", "invitation"],
	["has", "permission"],
];

/**
 * Handles edge cases like signInCredential and
 * signUpCredential
 */
function handleEdgeCases(str: string) {
	const splits = str.split("/").filter((s) => s);
	let index = 0;
	for (const path of splits) {
		const secondPath = splits[index + 1]?.trim();
		if (secondPath) {
			const isKnownCase = knownCases.some(
				([a, b]) => a === path && b === secondPath,
			);
			if (isKnownCase) {
				splits[index] = `${path}-${secondPath}`;
				splits.splice(1, index + 1);
			}
		}
	}
	return splits.join("/");
}

const knownPathMethods: Record<string, "POST" | "GET"> = {
	"/sign-out": "POST",
	"enable/totp": "POST",
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

export function getProxy(
	actions: Record<string, any>,
	client: BetterFetch,
	$signal?: {
		[key: string]: PreinitializedWritableAtom<boolean>;
	},
) {
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
					method: getMethod(key, args),
					onSuccess() {
						const signal = $signal?.[key as string];
						if (signal) {
							signal.set(!signal.get());
						}
					},
				});
			};
		},
	});
}
