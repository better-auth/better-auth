import { betterAuth } from "better-auth";

export const auth = betterAuth({
	database: {
		provider: "postgres",
		url: process.env.DATABASE_URL as string,
	},
});
