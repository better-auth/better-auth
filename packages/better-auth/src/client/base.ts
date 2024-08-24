import { BetterAuth } from "../auth";
import { createDynamicPathProxy } from "./proxy";
import { createClient } from "better-call/client";
import { BetterFetch, createFetch } from "@better-fetch/fetch";
import { getSessionAtom } from "./session-atom";
import { getOrganizationAtoms } from "./org-atoms";
import { getPasskeyActions } from "./passkey-actions";
import { addCurrentURL, csrfPlugin, redirectPlugin } from "./client-plugins";
import { InferRoutes } from "./path-to-object";
import { ClientOptions } from "./type";
import { getBaseURL } from "./client-utils";

export const createVanillaClient = <Auth extends BetterAuth = never>(
	options?: ClientOptions,
) => {
	type API = Auth extends never ? BetterAuth["api"] : Auth["api"];
	const $fetch = createFetch({
		...options,
		baseURL: getBaseURL(options?.baseURL),
		plugins: [redirectPlugin, addCurrentURL, csrfPlugin],
	});
	const { $session, $sessionSignal } = getSessionAtom<Auth>($fetch);
	const { signInPasskey, signUpPasskey } = getPasskeyActions($fetch);
	const { $activeOrganization, $listOrganizations, activeOrgId, $listOrg } =
		getOrganizationAtoms($fetch, $session);
	const actions = {
		setActiveOrg: (orgId: string | null) => {
			activeOrgId.set(orgId);
		},
		signInPasskey,
		signUpPasskey,
		$atoms: {
			$session,
			$activeOrganization,
			$listOrganizations,
		},
	};
	const proxy = createDynamicPathProxy(actions, $fetch, {
		"/create/organization": $listOrg,
		"/two-factor/enable": $sessionSignal,
		"/two-factor/disable": $sessionSignal,
	}) as unknown as InferRoutes<API> & typeof actions;
	return proxy;
};
