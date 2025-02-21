import { twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const { useSession, signIn, signOut, signUp, twoFactor } =
	createAuthClient({
		baseURL: "http://localhost:3000",
		plugins: [twoFactorClient()],
	});
