import { betterAuth } from "better-auth";
import { twoFactor } from "better-auth/plugins";
import Database from "bun:sqlite";

export const auth = betterAuth({
	baseURL: "http://localhost:4000",
	database: new Database("./auth.db"),
	emailAndPassword: {
		enabled: true,
	},
	plugins: [twoFactor()],
});
