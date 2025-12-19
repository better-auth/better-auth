import assert from "node:assert/strict";
import { DatabaseSync } from "node:sqlite";
import { describe, test } from "node:test";
import { betterAuth } from "better-auth";
import type { AuthClient } from "better-auth/client";
import { createAuthClient } from "better-auth/client";
import type { ApiKeyClientPlugin } from "better-auth/client/plugins";
import { apiKeyClient } from "better-auth/client/plugins";
import { getMigrations } from "better-auth/db";
import { apiKey } from "better-auth/plugins";

describe("server side client", () => {
	test("can use api key on server side", async () => {
		const database = new DatabaseSync(":memory:");
		const auth = betterAuth({
			baseURL: "http://localhost:3000",
			database,
			socialProviders: {
				github: {
					clientId: process.env.GITHUB_CLIENT_ID as string,
					clientSecret: process.env.GITHUB_CLIENT_SECRET as string,
				},
			},
			emailAndPassword: {
				enabled: true,
			},
			plugins: [
				apiKey({
					rateLimit: {
						enabled: false,
					},
				}),
			],
		});

		const { runMigrations } = await getMigrations(auth.options);
		await runMigrations();

		const authClient: AuthClient<{
			plugins: [ApiKeyClientPlugin];
		}> = createAuthClient({
			baseURL: "http://localhost:3000",
			plugins: [apiKeyClient()],
			fetchOptions: {
				customFetchImpl: async (url, init) => {
					return auth.handler(new Request(url, init));
				},
			},
		});

		const { user } = await auth.api.signUpEmail({
			body: {
				name: "Alex",
				email: "alex@test.com",
				password: "hello123",
			},
		});

		const { key, id, userId } = await auth.api.createApiKey({
			body: {
				name: "my-api-key",
				userId: user.id,
			},
		});

		const ret = database.prepare(`SELECT * FROM apiKey;`).all();
		assert.equal(ret.length, 1);
		const first = ret.at(-1)!;
		assert.equal(first.id, id);
		assert.equal(first.userId, userId);

		await authClient.getSession({
			fetchOptions: {
				headers: {
					"x-api-key": key,
				},
			},
		});
	});
});
