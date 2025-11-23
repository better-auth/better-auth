import { AsyncLocalStorage } from "node:async_hooks";
import type {
	BetterAuthClientOptions,
	BetterAuthOptions,
} from "@better-auth/core";
import type { SuccessContext } from "@better-fetch/fetch";
import { sql } from "kysely";
import { afterAll } from "vitest";
import { betterAuth } from "../auth";
import { createAuthClient } from "../client";
import { parseSetCookieHeader, setCookieToHeader } from "../cookies";
import { getAdapter, getMigrations } from "../db";
import { bearer } from "../plugins";
import type { Session, User } from "../types";
import { getBaseURL } from "../utils/url";

const cleanupSet = new Set<Function>();

type CurrentUserContext = {
	headers: Headers;
};
const currentUserContextStorage = new AsyncLocalStorage<CurrentUserContext>();

afterAll(async () => {
	for (const cleanup of cleanupSet) {
		await cleanup();
		cleanupSet.delete(cleanup);
	}
});

export async function getTestInstance<
	O extends Partial<BetterAuthOptions>,
	C extends BetterAuthClientOptions,
>(
	options?: O | undefined,
	config?:
		| {
				clientOptions?: C;
				port?: number;
				disableTestUser?: boolean;
				testUser?: Partial<User>;
				testWith?: "sqlite" | "postgres" | "mongodb" | "mysql";
		  }
		| undefined,
) {
	const testWith = config?.testWith || "sqlite";

	async function getPostgres() {
		const { Kysely, PostgresDialect } = await import("kysely");
		const { Pool } = await import("pg");
		return new Kysely({
			dialect: new PostgresDialect({
				pool: new Pool({
					connectionString:
						"postgres://user:password@localhost:5432/better_auth",
				}),
			}),
		});
	}

	async function getSqlite() {
		const { default: Database } = await import("better-sqlite3");
		return new Database(":memory:");
	}

	async function getMysql() {
		const { Kysely, MysqlDialect } = await import("kysely");
		const { createPool } = await import("mysql2/promise");
		return new Kysely({
			dialect: new MysqlDialect(
				createPool("mysql://user:password@localhost:3306/better_auth"),
			),
		});
	}

	async function mongodbClient() {
		const { MongoClient } = await import("mongodb");
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
		secret: "better-auth-secret-that-is-long-enough-for-validation-test",
		database:
			testWith === "postgres"
				? { db: await getPostgres(), type: "postgres" }
				: testWith === "mongodb"
					? await Promise.all([
							mongodbClient(),
							await import("../adapters/mongodb-adapter"),
						]).then(([db, { mongodbAdapter }]) => mongodbAdapter(db))
					: testWith === "mysql"
						? { db: await getMysql(), type: "mysql" }
						: await getSqlite(),
		emailAndPassword: {
			enabled: true,
		},
		rateLimit: {
			enabled: false,
		},
		advanced: {
			cookies: {},
		},
		logger: {
			level: "debug",
		},
	} satisfies BetterAuthOptions;

	const auth = betterAuth({
		baseURL: "http://localhost:" + (config?.port || 3000),
		...opts,
		...options,
		plugins: [bearer(), ...(options?.plugins || [])],
	} as unknown as O);

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
		await auth.api.signUpEmail({
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

	const cleanup = async () => {
		if (testWith === "mongodb") {
			const db = await mongodbClient();
			await db.dropDatabase();
			return;
		}
		if (testWith === "postgres") {
			const postgres = await getPostgres();
			await sql`DROP SCHEMA public CASCADE; CREATE SCHEMA public;`.execute(
				postgres,
			);
			await postgres.destroy();
			return;
		}

		if (testWith === "mysql") {
			const mysql = await getMysql();
			await sql`SET FOREIGN_KEY_CHECKS = 0;`.execute(mysql);
			const tables = await mysql.introspection.getTables();
			for (const table of tables) {
				// @ts-expect-error
				await mysql.deleteFrom(table.name).execute();
			}
			await sql`SET FOREIGN_KEY_CHECKS = 1;`.execute(mysql);
			return;
		}
		if (testWith === "sqlite") {
			const sqlite = await getSqlite();
			sqlite.close();
			return;
		}
	};
	cleanupSet.add(cleanup);

	const customFetchImpl = async (
		url: string | URL | Request,
		init?: RequestInit | undefined,
	) => {
		const headers = init?.headers || {};
		const storageHeaders = currentUserContextStorage.getStore()?.headers;
		return auth.handler(
			new Request(
				url,
				init
					? {
							...init,
							headers: new Headers({
								...(storageHeaders
									? Object.fromEntries(storageHeaders.entries())
									: {}),
								...(headers instanceof Headers
									? Object.fromEntries(headers.entries())
									: typeof headers === "object"
										? headers
										: {}),
							}),
						}
					: {
							headers,
						},
			),
		);
	};

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
			runWithUser: async (fn: (headers: Headers) => Promise<void>) => {
				return currentUserContextStorage.run({ headers }, async () => {
					await fn(headers);
				});
			},
		};
	}
	async function signInWithUser(email: string, password: string) {
		const headers = new Headers();
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
		runWithUser: async (
			email: string,
			password: string,
			fn: (headers: Headers) => Promise<void> | void,
		) => {
			const { headers } = await signInWithUser(email, password);
			return currentUserContextStorage.run({ headers }, async () => {
				await fn(headers);
			});
		},
	};
}
