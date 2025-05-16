import { betterAuth } from "better-auth";
import { mcp, oidcProvider } from "better-auth/plugins";

export const auth = betterAuth({
	baseURL: "http://localhost:3000",
	plugins: [
		mcp({
			loginPage: "/login",
		}),
	],
	emailAndPassword: {
		enabled: true,
	},
});
