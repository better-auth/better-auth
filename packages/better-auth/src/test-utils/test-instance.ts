import { betterAuth } from "../auth";
import { createFieldAttribute } from "../db/field";
import { github, google } from "../providers";
import { Server } from "bun";
import { beforeAll, afterAll } from "bun:test";

export async function getTestInstance() {
	const auth = betterAuth({
		oAuthProviders: [
			github({
				clientId: "test",
				clientSecret: "test",
			}),
			google({
				clientId: "test",
				clientSecret: "test",
			}),
		],
		user: {
			fields: {
				firstName: createFieldAttribute("string"),
			},
		},
		secret: "better-auth.secret",
		database: {
			provider: "sqlite",
			url: ":memory:",
		},
	});
	let server: Server;

	beforeAll(async () => {
		server = Bun.serve({
			fetch: async (req) => {
				try {
					const res = await auth.handler(req);
					return res;
				} catch (e) {
					return new Response(null, {
						status: 500,
					});
				}
			},
		});
	});
	afterAll(() => {
		server.stop();
	});
	return auth;
}
