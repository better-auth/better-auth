import { createAuthClient } from "better-auth/react";
import {
	organizationClient,
	twoFactorClient,
	passkeyClient,
	usernameClient,
} from "better-auth/client/plugins";
import { ac } from "./permissions";

export const authClient = createAuthClient({
	fetchOptions: {
		baseURL: "http://localhost:3000/api/auth",
	},
	plugins: [
		organizationClient(),
		twoFactorClient({
			twoFactorPage: "/two-factor",
		}),
		passkeyClient(),
		usernameClient(),
	],
});
