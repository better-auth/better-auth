import { betterAuth } from "better-auth";

export const auth = betterAuth({
	database: {
		provider: "sqlite",
		url: "./db.db",
	},
});
