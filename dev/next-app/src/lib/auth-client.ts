import { createAuthClient } from "better-auth/react";
import {
	organizationClient,
	twoFactorClient,
	passkeyClient,
} from "better-auth/client";

export const authClient = createAuthClient({
	baseURL: "http://localhost:3000/api/auth",
	authPlugins: [
		organizationClient(),
		twoFactorClient({ twoFactorPage: "/two-factor" }),
		passkeyClient,
	],
});

authClient.signInPasskey();

const res = authClient.useActiveOrganization();
