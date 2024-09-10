import { createAuthClient } from "better-auth/react";
import {
	organizationClient,
	twoFactorClient,
	passkeyClient,
	usernameClient,
} from "better-auth/client/plugins";

export const authClient = createAuthClient({
	plugins: [
		organizationClient(),
		twoFactorClient({
			twoFactorPage: "/two-factor",
		}),
		passkeyClient(),
		usernameClient(),
	],
});
