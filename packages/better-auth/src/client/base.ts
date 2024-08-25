import { BetterAuth } from "../auth";
import { createDynamicPathProxy } from "./proxy";
import { createFetch } from "@better-fetch/fetch";
import { getSessionAtom } from "./session-atom";
import { getOrganizationAtoms } from "./plugins/org-client";
import { getPasskeyActions } from "./plugins/passkey-client";
import { addCurrentURL, csrfPlugin, redirectPlugin } from "./fetch-plugins";
import { InferRoutes } from "./path-to-object";
import { ClientOptions, HasPlugin } from "./type";
import { getBaseURL } from "../utils/base-url";
import { Plugin } from "../types/plugins";

export const createVanillaClient = <Auth extends BetterAuth = never>(
	options?: ClientOptions,
) => {
	type BAuth = Auth extends never ? BetterAuth : Auth;
	type API = BAuth["api"];
	const $fetch = createFetch({
		...options,
		baseURL: getBaseURL(options?.baseURL),
		plugins: [redirectPlugin, addCurrentURL, csrfPlugin],
	});
	const { $session, $sessionSignal } = getSessionAtom<Auth>($fetch);
	const { signInPasskey, register } = getPasskeyActions($fetch);
	const { $activeOrganization, $listOrganizations, activeOrgId, $listOrg } =
		getOrganizationAtoms($fetch, $session);
	const actions = {
		setActiveOrganization: (orgId: string | null) => {
			activeOrgId.set(orgId);
		},
		passkey: {
			signIn: signInPasskey,
			/**
			 * Add a new passkey
			 */
			register: register,
		},
		$atoms: {
			$session,
			$activeOrganization,
			$listOrganizations,
		},
	};
	type HasPasskeyConfig = HasPlugin<"passkey", BAuth>;
	type HasOrganizationConfig = HasPlugin<"organization", BAuth>;
	type Actions = Pick<
		typeof actions,
		| (HasPasskeyConfig extends true ? "passkey" : never)
		| (HasOrganizationConfig extends true ? "setActiveOrganization" : never)
		| "$atoms"
	>;
	const proxy = createDynamicPathProxy(actions, $fetch, {
		"/create/organization": $listOrg,
		"/two-factor/enable": $sessionSignal,
		"/two-factor/disable": $sessionSignal,
		"/sign-out": $sessionSignal,
	}) as unknown as InferRoutes<API> & Actions;
	return proxy;
};
