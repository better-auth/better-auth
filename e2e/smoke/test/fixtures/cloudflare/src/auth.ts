import { env } from "cloudflare:workers";
import { scim } from "@better-auth/scim";
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
	plugins: [
		jwt(),
		sso(),
		scim({
			connections: [
				{
					id: "workforce",
					credentials: [
						{ type: "bearer", id: "scim-token", token: "scim-token" },
					],
				},
			],
		}),
	],
});
