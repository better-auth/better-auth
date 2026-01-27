import { electronClient } from "@better-auth/electron/client";
import { createAuthClient } from "better-auth/client";

export const authClient = createAuthClient({
	baseURL: "http://localhost:3000/api/auth",
	plugins: [
		electronClient({
			protocol: {
				scheme: "com.better-auth.demo",
			},
			signInURL: "http://localhost:3000/sign-in",
		}),
	],
});
