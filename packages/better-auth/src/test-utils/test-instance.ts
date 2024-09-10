import fs from "fs/promises";
import { alphabet, generateRandomString } from "oslo/crypto";
import { afterAll, beforeAll } from "vitest";
import { betterAuth } from "../auth";
import { createAuthClient } from "../client/vanilla";
import { github, google } from "../social-providers";
import type { BetterAuthOptions } from "../types";
import { getMigrations } from "../cli/utils/get-migration";
import { parseSetCookieHeader } from "../utils/cookies";
import type { SuccessContext } from "@better-fetch/fetch";
import { createKyselyAdapter } from "../adapters/kysely";
import { getAdapter } from "../adapters/utils";

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

	const testUser = {
		email: "test@test.com",
		password: "test123456",
		name: "test",
	};
	async function createTestUser() {
		await auth.api.signUpEmail({
			body: testUser,
		});
	}

	const { runMigrations } = await getMigrations(auth.options);
	await runMigrations();
	await createTestUser();

	afterAll(async () => {
		await fs.unlink(dbName);
	});

	async function signInWithTestUser() {
		let headers = new Headers();
		const res = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			options: {
				onSuccess(context) {
					const header = context.response.headers.get("set-cookie");
					const cookies = parseSetCookieHeader(header || "");
					const signedCookie = cookies.get("better-auth.session_token")?.value;
					headers.set("cookie", `better-auth.session_token=${signedCookie}`);
				},
			},
		});
		return {
			res,
			headers,
		};
	}
	async function signInWithUser(email: string, password: string) {
		let headers = new Headers();
		const res = await client.signIn.email({
			email,
			password,
			options: {
				onSuccess(context) {
					const header = context.response.headers.get("set-cookie");
					const cookies = parseSetCookieHeader(header || "");
					const signedCookie = cookies.get("better-auth.session_token")?.value;
					headers.set("cookie", `better-auth.session_token=${signedCookie}`);
				},
			},
		});
		return {
			res,
			headers,
		};
	}

	const customFetchImpl = async (
		url: string | URL | Request,
		init?: RequestInit,
	) => {
		const req = new Request(url.toString(), init);
		return auth.handler(req);
	};

	function sessionSetter(headers: Headers) {
		return (context: SuccessContext) => {
			const header = context.response.headers.get("set-cookie");
			if (header) {
				const cookies = parseSetCookieHeader(header || "");
				const signedCookie = cookies.get("better-auth.session_token")?.value;
				headers.set("cookie", `better-auth.session_token=${signedCookie}`);
			}
		};
	}

	const client = createAuthClient({
		fetchOptions: {
			customFetchImpl,
			baseURL:
				options?.baseURL || "http://localhost:" + (port || 3000) + "/api/auth",
		},
	});
	return {
		auth,
		client,
		testUser,
		signInWithTestUser,
		signInWithUser,
		customFetchImpl,
		sessionSetter,
		db: getAdapter(auth.options),
	};
}
