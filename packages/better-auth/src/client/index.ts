import { ClientOptions } from "./base";
import { BetterAuth } from "../auth";
import {
	InferActions,
	InferredActions,
	PickDefaultPaths,
	PickOrganizationPaths,
	PickProvidePaths,
} from "./type";
import { getProxy } from "./proxy";
import { createClient } from "better-call/client";
import {
	BetterFetch,
	betterFetch,
	BetterFetchPlugin,
	createFetch,
} from "@better-fetch/fetch";
import { BetterAuthError } from "../error/better-auth-error";
import {
	CustomProvider,
	OAuthProvider,
	OAuthProviderList,
	Provider,
} from "../types/provider";
import { UnionToIntersection } from "../types/helper";
import { Prettify } from "better-call";
import { atom, computed, task } from "nanostores";
import { FieldAttribute, InferFieldOutput } from "../db";
import { Session, User } from "../adapters/schema";
import {
	Invitation,
	Member,
	Organization,
} from "../plugins/organization/schema";
import {
	PublicKeyCredentialCreationOptionsJSON,
	PublicKeyCredentialRequestOptionsJSON,
} from "@simplewebauthn/types";
import {
	startAuthentication,
	startRegistration,
	WebAuthnError,
} from "@simplewebauthn/browser";
import { Passkey } from "../providers/passkey";
import { getSessionAtom } from "./session-atom";
import { getOrganizationAtoms } from "./org-atoms";
import { getPasskeyActions } from "./passkey-actions";

const redirectPlugin = {
	id: "redirect",
	name: "Redirect",
	hooks: {
		onSuccess(context) {
			if (context.data?.url && context.data?.redirect) {
				console.log("redirecting to", context.data.url);
				window.location.href = context.data.url;
			}
		},
	},
} satisfies BetterFetchPlugin;

const addCurrentURL = {
	id: "add-current-url",
	name: "Add current URL",
	hooks: {
		onRequest(context) {
			if (typeof window !== "undefined") {
				const url = new URL(context.url);
				url.searchParams.set("currentURL", window.location.href);
				context.url = url;
			}
			return context;
		},
	},
} satisfies BetterFetchPlugin;

export const csrfPlugin = {
	id: "csrf",
	name: "CSRF Check",
	async init(url, options) {
		if (options?.method !== "GET") {
			options = options || {};
			const { data, error } = await betterFetch<{
				csrfToken: string;
			}>("/csrf", {
				baseURL: options.baseURL,
			});
			if (error?.status === 404) {
				throw new BetterAuthError(
					"Route not found. Make sure the server is running and the base URL is correct and includes the path (e.g. http://localhost:3000/api/auth).",
				);
			}
			if (error) {
				throw new BetterAuthError(error.message || "Failed to get CSRF token.");
			}
			options.body = {
				...options?.body,
				csrfToken: data.csrfToken,
			};
		}
		return { url, options };
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
		plugins: [redirectPlugin, addCurrentURL, csrfPlugin],
	});

	const $fetch = createFetch({
		...options,
		baseURL: options?.baseURL || inferBaeURL(),
		plugins: [redirectPlugin, addCurrentURL, csrfPlugin],
	});

	const signInOAuth = async (data: {
		provider: Auth["options"]["providers"] extends Array<infer T>
			? T extends OAuthProvider
				? T["id"]
				: never
			: OAuthProviderList[number];
		callbackURL: string;
	}) => {
		const res = await client("@post/signin/oauth", {
			body: data,
		});
		if (res.data?.redirect) {
			window.location.href = res.data.url;
		}
		return res;
	};

	const { $session } = getSessionAtom<Auth>($fetch);
	const { signInPasskey, signUpPasskey } = getPasskeyActions($fetch);
	const { $activeOrganization, $listOrganizations, activeOrgId, $listOrg } =
		getOrganizationAtoms<Auth>($fetch, $session);

	const actions = {
		signInOAuth,
		$session,
		$activeOrganization,
		$listOrganizations,
		setActiveOrg: (orgId: string | null) => {
			activeOrgId.set(orgId);
		},
		signInPasskey,
		signUpPasskey,
	};

	type PickedActions = Pick<
		typeof actions,
		| PickOrganizationPaths<Auth>
		| PickDefaultPaths
		| PickProvidePaths<"passkey", "signInPasskey" | "signUpPasskey", Auth>
	>;

	const proxy = getProxy(actions, client as BetterFetch, {
		"create/organization": $listOrg,
	}) as InferredActions<Auth> & PickedActions;
	return proxy;
};
