import { createAuthClient } from "better-auth/react";
import {
	organizationClient,
	twoFactorClient,
	passkeyClient,
} from "better-auth/client/plugins";

export const authClient = createAuthClient({
	baseURL: "http://localhost:3000/api/auth",
	plugins: [
		organizationClient(),
		twoFactorClient({ twoFactorPage: "/two-factor" }),
		passkeyClient,
	],
});

authClient.signInPasskey();
