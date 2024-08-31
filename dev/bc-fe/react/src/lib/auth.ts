import { createAuthClient } from "better-auth/react";
import { twoFactorClient } from "better-auth/client";

export const auth = createAuthClient({
	baseURL: "http://localhost:3000/api/auth",
	authPlugins: [twoFactorClient],
});
