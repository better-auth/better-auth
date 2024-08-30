import { createFetch } from "@better-fetch/fetch";
import type { router } from "../api";
import type { BetterAuth } from "../auth";
import { getBaseURL } from "../utils/base-url";
import { addCurrentURL, csrfPlugin, redirectPlugin } from "./fetch-plugins";
import type { InferRoutes } from "./path-to-object";
import { getOrganizationAtoms } from "./plugins/org-client";
import { getPasskeyActions } from "./plugins/passkey-client";
import { createDynamicPathProxy } from "./proxy";
import { getSessionAtom } from "./session-atom";
import type { ClientOptions, HasPlugin } from "./type";

export const createAuthClient = <Auth extends BetterAuth = never>(
	options?: ClientOptions,
) => {
	type BAuth = Auth extends never ? BetterAuth : Auth;
	type API = Auth extends never
		? ReturnType<typeof router>["endpoints"]
		: BAuth["api"];
	const $fetch = createFetch({
		method: "GET",
		...options,
		baseURL: getBaseURL(options?.baseURL).withPath,
		plugins: [
			redirectPlugin,
			addCurrentURL,
			...(options?.csrfPlugin !== false ? [csrfPlugin] : []),
			...(options?.plugins || []),
		],
	});
	const { $session, $sessionSignal } = getSessionAtom<Auth>($fetch);
	const { signInPasskey, register } = getPasskeyActions($fetch);
	const {
		$activeOrganization,
		$listOrganizations,
		activeOrgId,
		$listOrg,
		$activeOrgSignal,

		$activeInvitationId,
		$invitation,
	} = getOrganizationAtoms($fetch, $session);

	const actions = {
		setActiveOrganization: (orgId: string | null) => {
			activeOrgId.set(orgId);
		},
		setInvitationId: (id: string | null) => {
			$activeInvitationId.set(id);
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
			$activeInvitationId,
			$invitation,
		},
		$fetch,
	};
	type HasPasskeyConfig = HasPlugin<"passkey", BAuth>;
	type HasOrganizationConfig = HasPlugin<"organization", BAuth>;
	type Actions = Pick<
		typeof actions,
		| (HasPasskeyConfig extends true ? "passkey" : never)
		| (HasOrganizationConfig extends true
				? "setActiveOrganization" | "setInvitationId"
				: never)
		| "$atoms"
		| "$fetch"
	>;

	const proxy = createDynamicPathProxy(actions, $fetch, [
		{
			matcher: (path) => path === "/organization/create",
			atom: $listOrg,
		},
		{
			matcher: (path) => path.startsWith("/organization"),
			atom: $activeOrgSignal,
		},
		{
			matcher: (path) => path === "/sign-out",
			atom: $sessionSignal,
		},
		{
			matcher: (path) =>
				path === "/two-factor/enable" || path === "/two-factor/send-otp",
			atom: $sessionSignal,
		},
	]) as unknown as InferRoutes<API> & Actions;
	return proxy;
};
