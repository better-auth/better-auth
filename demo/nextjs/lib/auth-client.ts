import { createAuthClient } from "better-auth/react";
import {
	organizationClient,
	passkeyClient,
	twoFactorClient,
} from "better-auth/client/plugins";

export const client = createAuthClient({
	plugins: [
		organizationClient(),
		twoFactorClient({
			twoFactorPage: "/two-factor",
		}),
		passkeyClient(),
	],
	fetchOptions: {
		credentials: "include",
	},
});

export const {
	signUp,
	signIn,
	signOut,
	useSession,
	user,
	organization,
	useListOrganizations,
	useActiveOrganization,
} = client;
