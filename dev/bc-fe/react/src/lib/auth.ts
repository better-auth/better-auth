import { createAuthClient } from "better-auth/react";
import { twoFactorClient, usernameClient } from "better-auth/client/plugins";

export const auth = createAuthClient({
	baseURL: "http://localhost:3000/api/auth",
	plugins: [
		twoFactorClient({
			twoFactorPage: "/two-factor",
		}),
		usernameClient(),
	],
});
