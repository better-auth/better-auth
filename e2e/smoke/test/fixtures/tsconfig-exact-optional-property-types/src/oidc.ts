import { betterAuth } from "better-auth";
import { oidcProvider } from "better-auth/plugins";

export const auth = betterAuth({
	plugins: [
		oidcProvider({
			loginPage: "/login",
		}),
	],
});
