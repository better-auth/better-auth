import fs from "fs/promises";
import { alphabet, generateRandomString } from "../crypto/random";
import { afterAll } from "vitest";
import { betterAuth } from "../auth";
import { createAuthClient } from "../client/vanilla";
import type { BetterAuthOptions, ClientOptions, User } from "../types";
import { getMigrations } from "../cli/utils/get-migration";
import { parseSetCookieHeader } from "../cookies";
import type { SuccessContext } from "@better-fetch/fetch";
import { getAdapter } from "../db/utils";
import Database from "better-sqlite3";

export async function getTestInstance<
	O extends Partial<BetterAuthOptions>,
	C extends ClientOptions,
>(
	options?: O,
	config?: {
		clientOptions?: C;
		port?: number;
		disableTestUser?: boolean;
		testUser?: Partial<User>;
	},
) {
	/**
	 * create db folder if not exists
	 */
	await fs.mkdir(".db", { recursive: true });
	const randomStr = generateRandomString(4, alphabet("a-z"));
	const dbName = `./.db/test-${randomStr}.db`;
	const opts = {
		socialProviders: {
			github: {
				clientId: "test",
				clientSecret: "test",
			},
			google: {
				clientId: "test",
				clientSecret: "test",
			},
		},
		secret: "better-auth.secret",
		database: new Database(dbName),
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
		...config?.testUser,
	};
	async function createTestUser() {
		if (config?.disableTestUser) {
			return;
		}
		//@ts-expect-error
		await auth.api.signUpEmail({
			body: testUser,
		});
	}

	const { runMigrations } = await getMigrations({
		...auth.options,
		database: opts.database,
	});
	await runMigrations();
	await createTestUser();

	afterAll(async () => {
		await fs.unlink(dbName);
	});

	async function signInWithTestUser() {
		if (config?.disableTestUser) {
			throw new Error("Test user is disabled");
		}
		let headers = new Headers();
		const setCookie = (name: string, value: string) => {
			const current = headers.get("cookie");
			headers.set("cookie", `${current || ""}; ${name}=${value}`);
		};
		//@ts-expect-error
		const res = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,

			fetchOptions: {
				//@ts-expect-error
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
			setCookie,
		};
	}
	async function signInWithUser(email: string, password: string) {
		let headers = new Headers();
		//@ts-expect-error
		const res = await client.signIn.email({
			email,
			password,
			fetchOptions: {
				//@ts-expect-error
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
		...(config?.clientOptions as C extends undefined ? {} : C),
		baseURL:
			options?.baseURL ||
			"http://localhost:" + (config?.port || 3000) + "/api/auth",
		fetchOptions: {
			customFetchImpl,
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
		db: await getAdapter(auth.options),
	};
}
