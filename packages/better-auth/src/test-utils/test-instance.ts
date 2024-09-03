import fs from "fs/promises";
import { alphabet, generateRandomString } from "oslo/crypto";
import { afterAll, beforeAll } from "vitest";
import { betterAuth } from "../auth";
import { createAuthClient } from "../client/vanilla";
import { github, google } from "../social-providers";
import type { BetterAuthOptions } from "../types";
import { getMigrations } from "../cli/utils/get-migration";

export async function getTestInstance<O extends Partial<BetterAuthOptions>>(
	options?: O,
	port?: number,
) {
	/**
	 * create db folder if not exists
	 */
	await fs.mkdir(".db", { recursive: true });
	const randomStr = generateRandomString(4, alphabet("a-z"));
	const dbName = `./.db/test-${randomStr}.db`;
	const opts = {
		socialProvider: [
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
			url: dbName,
		},
		emailAndPassword: {
			enabled: true,
		},
	} satisfies BetterAuthOptions;

	const auth = betterAuth({
		...opts,
		...options,
	} as O extends undefined ? typeof opts : O & typeof opts);

	async function createTestUser() {
		await auth.api.signUpEmail({
			body: {
				email: "test@test.com",
				password: "test123456",
				name: "test",
			},
		});
		return {
			email: "test@test.com",
			password: "test123456",
		};
	}

	beforeAll(async () => {
		const { runMigrations } = await getMigrations(opts);
		await runMigrations();
	});

	afterAll(async () => {
		await fs.unlink(dbName);
	});

	const client = createAuthClient({
		fetchOptions: {
			customFetchImpl: async (url, init) => {
				const req = new Request(url.toString(), init);
				return auth.handler(req);
			},
			baseURL:
				options?.baseURL && options.basePath
					? `${options?.baseURL}/${options?.basePath}`
					: "http://localhost:3000/api/auth",
		},
	});
	return {
		auth,
		client,
		createTestUser,
	};
}
