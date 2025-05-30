import fs from "fs/promises";
import { generateRandomString } from "../crypto/random";
import { afterAll } from "vitest";
import { betterAuth } from "../auth";
import { createAuthClient } from "../client/vanilla";
import type { BetterAuthOptions, ClientOptions, Session, User } from "../types";
import { getMigrations } from "../db/get-migration";
import { parseSetCookieHeader, setCookieToHeader } from "../cookies";
import type { SuccessContext } from "@better-fetch/fetch";
import { getAdapter } from "../db/utils";
import Database from "better-sqlite3";
import { getBaseURL } from "../utils/url";
import { Kysely, MysqlDialect, PostgresDialect, sql } from "kysely";
import { Pool } from "pg";
import { MongoClient } from "mongodb";
import { mongodbAdapter } from "../adapters/mongodb-adapter";
import { createPool } from "mysql2/promise";
import { bearer } from "../plugins";

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
		testWith?: "sqlite" | "postgres" | "mongodb" | "mysql";
	},
) {
	const testWith = config?.testWith || "sqlite";
	/**
	 * create db folder if not exists
	 */
	await fs.mkdir(".db", { recursive: true });
	const randomStr = generateRandomString(4, "a-z");
	const dbName = `./.db/test-${randomStr}.db`;

	const postgres = new Kysely({
		dialect: new PostgresDialect({
			pool: new Pool({
				connectionString: "postgres://user:password@localhost:5432/better_auth",
			}),
		}),
	});

	const mysql = new Kysely({
		dialect: new MysqlDialect(
			createPool("mysql://user:password@localhost:3306/better_auth"),
		),
	});

	async function mongodbClient() {
		const dbClient = async (connectionString: string, dbName: string) => {
			const client = new MongoClient(connectionString);
			await client.connect();
			const db = client.db(dbName);
			return db;
		};
		const db = await dbClient("mongodb://127.0.0.1:27017", "better-auth");
		return db;
	}

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
		database:
			testWith === "postgres"
				? { db: postgres, type: "postgres" }
				: testWith === "mongodb"
					? mongodbAdapter(await mongodbClient())
					: testWith === "mysql"
						? { db: mysql, type: "mysql" }
						: new Database(dbName),
		emailAndPassword: {
			enabled: true,
		},
		rateLimit: {
			enabled: false,
		},
		advanced: {
			cookies: {},
		},
	} satisfies BetterAuthOptions;

	const auth = betterAuth({
		baseURL: "http://localhost:" + (config?.port || 3000),
		...opts,
		...options,
		advanced: {
			disableCSRFCheck: true,
			...options?.advanced,
		},
		plugins: [bearer(), ...(options?.plugins || [])],
	} as O extends undefined ? typeof opts : O & typeof opts);

	const testUser = {
		email: "test@test.com",
		password: "test123456",
		name: "test user",
		...config?.testUser,
	};
	async function createTestUser() {
		if (config?.disableTestUser) {
			return;
		}
		//@ts-expect-error
		const res = await auth.api.signUpEmail({
			body: testUser,
		});
	}

	if (testWith !== "mongodb") {
		const { runMigrations } = await getMigrations({
			...auth.options,
			database: opts.database,
		});
		await runMigrations();
	}

	await createTestUser();

	afterAll(async () => {
		if (testWith === "mongodb") {
			const db = await mongodbClient();
			await db.dropDatabase();
			return;
		}
		if (testWith === "postgres") {
			await sql`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`.execute(
				postgres,
			);
			await postgres.destroy();
			return;
		}

		if (testWith === "mysql") {
			await sql`SET FOREIGN_KEY_CHECKS = 0;`.execute(mysql);
			const tables = await mysql.introspection.getTables();
			for (const table of tables) {
				// @ts-expect-error
				await mysql.deleteFrom(table.name).execute();
			}
			await sql`SET FOREIGN_KEY_CHECKS = 1;`.execute(mysql);
			return;
		}

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
		const { data, error } = await client.signIn.email({
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
			session: data.session as Session,
			user: data.user as User,
			headers,
			setCookie,
		};
	}
	async function signInWithUser(email: string, password: string) {
		let headers = new Headers();
		//@ts-expect-error
		const { data } = await client.signIn.email({
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
			res: data as {
				user: User;
				session: Session;
			},
			headers,
		};
	}

	const customFetchImpl = async (
		url: string | URL | Request,
		init?: RequestInit,
	) => {
		return auth.handler(new Request(url, init));
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
		baseURL: getBaseURL(
			options?.baseURL || "http://localhost:" + (config?.port || 3000),
			options?.basePath || "/api/auth",
		),
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
		cookieSetter: setCookieToHeader,
		customFetchImpl,
		sessionSetter,
		db: await getAdapter(auth.options),
	};
}
