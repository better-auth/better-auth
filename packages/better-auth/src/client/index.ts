import { ClientOptions } from "./base";
import { BetterAuth } from "../auth";
import {
	InferredActions,
	PickDefaultPaths,
	PickOrganizationPaths,
	PickProvidePaths,
} from "./type";
import { getProxy } from "./proxy";
import { createClient } from "better-call/client";
import { BetterFetch, createFetch } from "@better-fetch/fetch";
import { OAuthProvider, OAuthProviderList } from "../types/provider";
import { getSessionAtom } from "./session-atom";
import { getOrganizationAtoms } from "./org-atoms";
import { getPasskeyActions } from "./passkey-actions";
import { inferBaeURL } from "./client-utils";
import { addCurrentURL, csrfPlugin, redirectPlugin } from "./client-plugins";

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
		getOrganizationAtoms($fetch, $session);

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
