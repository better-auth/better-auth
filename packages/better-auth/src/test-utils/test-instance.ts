import { betterAuth } from "../auth";
import { github, google } from "../social-providers";
import { afterAll } from "vitest";
import fs from "fs/promises";
import { BetterAuthOptions } from "../types";
import { createAuthClient } from "../client";
import { alphabet, generateRandomString } from "oslo/crypto";

export async function getTestInstance<O extends Partial<BetterAuthOptions>>(
	options?: O,
	port?: number,
) {
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

	async function createTestUser() {
		await auth.api.signUpCredential({
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

	afterAll(async () => {
		await fs.unlink(dbName);
	});

	const client = createAuthClient<typeof auth>({
		customFetchImpl: async (url, init) => {
			const req = new Request(url.toString(), init);
			return auth.handler(req);
		},
		baseURL:
			options?.baseURL && options.basePath
				? `${options?.baseURL}/${options?.basePath}`
				: "http://localhost:3000/api/auth",
		csrfPlugin: false,
	});
	return {
		auth,
		client,
		createTestUser,
	};
}
