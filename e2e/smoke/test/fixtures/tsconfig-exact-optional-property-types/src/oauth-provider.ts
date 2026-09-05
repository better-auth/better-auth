/**
 * @see https://github.com/better-auth/better-auth/issues/10213
 */
import { oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";

export const auth = betterAuth({
	plugins: [
		oauthProvider({
			loginPage: "/login",
			consentPage: "/consent",
		}),
	],
});
