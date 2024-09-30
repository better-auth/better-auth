import { betterAuth } from "better-auth";

export const auth = betterAuth({
	database: {
		provider: "mysql",
		url:
			process.env.DATABASE_URL ||
			"postgres://postgres:password@localhost:5432/better_auth",
	},
});
