/**
 * @see https://github.com/better-auth/better-auth/issues/10213
 */
import { mcp } from "@better-auth/mcp";
import { betterAuth } from "better-auth";

export const auth = betterAuth({
	plugins: [
		mcp({
			resource: "https://example.com/mcp",
			loginPage: "/login",
			consentPage: "/consent",
		}),
	],
});
