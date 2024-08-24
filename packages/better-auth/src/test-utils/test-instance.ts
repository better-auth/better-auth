import { betterAuth } from "../auth";
import { github, google } from "../providers";
import { beforeAll, afterAll } from "vitest";
import { type Listener, listen } from "listhen";
import { toNodeHandler } from "better-call";
import fs from "fs/promises";
import { BetterAuthOptions } from "../types";

export async function getTestInstance<O extends Partial<BetterAuthOptions>>(
	options?: O,
) {
	const opts = {
		providers: [
			github({
				clientId: "test",
				clientSecret: "test",
			}),
			google({
				clientId: "test",
				clientSecret: "test",
			}),
		],
		secret: "better-auth.secret",
		database: {
			provider: "sqlite",
			url: "./test.db",
			autoMigrate: true,
		},
		emailAndPassword: {
			enabled: true,
		},
	} satisfies BetterAuthOptions;

	const auth = betterAuth({
		...opts,
		...options,
	} as O extends undefined ? typeof opts : O & typeof opts);

	let server: Listener;

	beforeAll(async () => {
		server = await listen(toNodeHandler(auth.handler));
	});
	afterAll(async () => {
		server.close();
		await fs.unlink("./test.db");
	});
	return auth;
}
