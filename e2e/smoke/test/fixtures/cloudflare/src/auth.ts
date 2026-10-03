import { env } from "cloudflare:workers";
import { sso } from "@better-auth/sso";
import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins/jwt";

export const auth = betterAuth({
	baseURL: "http://localhost:4000",
	database: env.DB,
	emailAndPassword: {
		enabled: true,
	},
	logger: {
		level: "debug",
	},
	plugins: [jwt(), sso()],
});
