import { betterAuth } from "better-auth";

export const auth = betterAuth({
	database: {
		provider: "sqlite",
		url: "bun-auth.db",
	},
});
