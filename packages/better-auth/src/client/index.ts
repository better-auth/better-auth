import { ClientOptions } from "./base";
import { BetterAuth } from "../auth";
import { O } from "./type";
import { getProxy } from "./proxy";
import { ProviderList } from "../providers";
import { createClient } from "better-call/client";
import { BetterFetchPlugin } from "@better-fetch/fetch";
import { BetterAuthError } from "../error/better-auth-error";

const redirectPlugin = {
	id: "redirect",
	name: "Redirect",
	hooks: {
		onSuccess(context) {
			if (context.data.url && context.data.redirect) {
				console.log("redirecting to", context.data.url);
			}
		},
	},
} satisfies BetterFetchPlugin;

const addCurrentURL = {
	id: "add-current-url",
	name: "Add current URL",
	hooks: {
		onRequest(context) {
			const url = new URL(context.url);
			url.searchParams.set("currentURL", window.location.href);
			context.url = url
			return context
		},
	},
} satisfies BetterFetchPlugin;

function inferBaeURL() {
	const url =
		process.env.AUTH_URL ||
		process.env.NEXT_PUBLIC_AUTH_URL ||
		process.env.BETTER_AUTH_URL ||
		process.env.NEXT_PUBLIC_BETTER_AUTH_URL ||
		process.env.VERCEL_URL ||
		process.env.NEXT_PUBLIC_VERCEL_URL;
	if (url) {
		return url;
	}
	if (
		!url &&
		(process.env.NODE_ENV === "development" || process.env.NODE_ENV === "test")
	) {
		return "http://localhost:3000";
	}
	throw new BetterAuthError(
		"Could not infer baseURL from environment variables. Please pass it as an option to the createClient function.",
	);
}

export const createAuthClient = <Auth extends BetterAuth = BetterAuth>(
	options?: ClientOptions,
) => {
	type API = BetterAuth["api"];
	const client = createClient<API>({
		...options,
		baseURL: options?.baseURL || inferBaeURL(),
		plugins: [redirectPlugin, addCurrentURL],
	});
	const signInOAuth = async (data: {
		provider: Auth["options"]["providers"] extends Array<infer T>
		? T extends { id: infer Id }
		? Id
		: never
		: ProviderList[number];
		callbackURL: string;
	}) => {
		const res = await client("@post/signin/oauth", {
			body: data,
		});
		if (res.data?.redirect) {
			window.location.href = res.data.url
		}
		return res
	};
	const actions = {
		signInOAuth,
	};
	return getProxy(actions, client) as typeof actions & O<Auth>;
};
