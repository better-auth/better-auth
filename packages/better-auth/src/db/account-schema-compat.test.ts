import { DatabaseSync } from "node:sqlite";
import type { BetterAuthOptions } from "@better-auth/core";
import { runWithTransaction } from "@better-auth/core/context";
import { SchemaMismatchError } from "@better-auth/core/db/internal";
import { kyselyAdapter } from "@better-auth/kysely-adapter";
import { NodeSqliteDialect } from "@better-auth/kysely-adapter/node-sqlite-dialect";
import { CamelCasePlugin, Kysely } from "kysely";
import { describe, expect, it, vi } from "vitest";
import { betterAuth } from "../auth/full";
import { getMigrations } from "./get-migration";

const USER_TABLE = `create table "user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "emailVerified" integer not null, "image" text, "createdAt" date not null, "updatedAt" date not null);`;

const SESSION_TABLE = `create table "session" ("id" text not null primary key, "expiresAt" date not null, "token" text not null unique, "createdAt" date not null, "updatedAt" date not null, "ipAddress" text, "userAgent" text, "userId" text not null references "user" ("id") on delete cascade);`;

const VERIFICATION_TABLE = `create table "verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expiresAt" date not null, "createdAt" date not null, "updatedAt" date not null);`;

/** The account table as every v1 release outside 1.7.0 through 1.7.2 declares it. */
const ACCOUNT_TABLE = `create table "account" ("id" text not null primary key, "accountId" text not null, "providerId" text not null, "userId" text not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" date, "refreshTokenExpiresAt" date, "scope" text, "password" text, "createdAt" date not null, "updatedAt" date not null);`;

/** The account table as 1.7.0 through 1.7.2 declared it, with a required issuer. */
const ACCOUNT_TABLE_WITH_ISSUER = `create table "account" ("id" text not null primary key, "issuer" text not null, "accountId" text not null, "providerId" text not null, "userId" text not null references "user" ("id") on delete cascade, "accessToken" text, "refreshToken" text, "idToken" text, "accessTokenExpiresAt" date, "refreshTokenExpiresAt" date, "scope" text, "password" text, "createdAt" date not null, "updatedAt" date not null);
create unique index "account_issuer_accountId_uidx" on "account" ("issuer", "accountId");`;

function createDatabase(accountTable: string) {
	const database = new DatabaseSync(":memory:");
	database.exec(
		[USER_TABLE, SESSION_TABLE, accountTable, VERIFICATION_TABLE].join("\n"),
	);
	return database;
}

function seedAccountWrittenBy17(database: DatabaseSync) {
	const timestamp = new Date().toISOString();
	database.exec(
		`insert into "user" values ('u1', 'Employee', 'written-by-1-7@example.com', 0, null, '${timestamp}', '${timestamp}');
		 insert into "account" values ('a1', 'https://idp.example.com', 'google-subject', 'google', 'u1', null, null, null, null, null, null, null, '${timestamp}', '${timestamp}');`,
	);
}

function createAuth(
	database: DatabaseSync,
	extra: Partial<BetterAuthOptions> = {},
) {
	const warnings: string[] = [];
	const auth = betterAuth({
		baseURL: "http://localhost:3000",
		secret: "better-auth-secret-that-is-long-enough-for-validation-test",
		database,
		emailAndPassword: { enabled: true },
		logger: {
			level: "warn",
			log: (_level, message) => {
				warnings.push(message);
			},
		},
		...extra,
	});
	return { auth, warnings };
}

/** Signs a user up, links a social account, then reads it back by its key. */
async function signUpAndLinkSocialAccount(
	auth: ReturnType<typeof createAuth>["auth"],
	email: string,
) {
	const signUp = await auth.api.signUpEmail({
		body: { email, password: "correct-horse-battery-staple", name: "Employee" },
	});
	const { internalAdapter } = await auth.$context;
	const linked = await internalAdapter.createAccount({
		providerId: "google",
		accountId: "google-subject",
		userId: signUp.user.id,
	});
	const found = await internalAdapter.findAccountByKey({
		providerId: "google",
		accountId: "google-subject",
	});
	return { signUp, linked, found };
}

/**
 * @see https://github.com/better-auth/better-auth/issues/11146
 */
describe("account table compatibility across v1 releases", () => {
	it("asks for no migration and links accounts without the issuer column", async ({
		onTestFinished,
	}) => {
		const database = createDatabase(ACCOUNT_TABLE);
		onTestFinished(() => database.close());
		const { auth, warnings } = createAuth(database);

		const { toBeCreated, toBeAdded, schemaProblems } = await getMigrations(
			auth.options,
		);
		expect(toBeCreated).toEqual([]);
		expect(toBeAdded).toEqual([]);
		expect(schemaProblems).toEqual([]);

		const { signUp, linked, found } = await signUpAndLinkSocialAccount(
			auth,
			"without-issuer-column@example.com",
		);
		expect(signUp.user.email).toBe("without-issuer-column@example.com");
		expect(found?.id).toBe(linked.id);

		const columns = database
			.prepare(`select name from pragma_table_info('account')`)
			.all() as { name: string }[];
		expect(columns.map((column) => column.name)).not.toContain("issuer");
		expect(warnings).toEqual([]);
	});

	it("keeps accounts written by 1.7 readable through their provider key", async ({
		onTestFinished,
	}) => {
		const database = createDatabase(ACCOUNT_TABLE_WITH_ISSUER);
		onTestFinished(() => database.close());
		seedAccountWrittenBy17(database);
		const { auth } = createAuth(database);

		const { internalAdapter } = await auth.$context;
		const found = await internalAdapter.findAccountByKey({
			providerId: "google",
			accountId: "google-subject",
		});
		expect(found?.id).toBe("a1");
		expect(found?.userId).toBe("u1");
	});

	it("rejects every request until the required issuer column is relaxed", async ({
		onTestFinished,
	}) => {
		const database = createDatabase(ACCOUNT_TABLE_WITH_ISSUER);
		onTestFinished(() => database.close());
		seedAccountWrittenBy17(database);
		const { auth } = createAuth(database);

		// Migrations never drop a column, so the CLI reports it instead.
		const { toBeAdded, schemaProblems } = await getMigrations(auth.options);
		expect(toBeAdded).toEqual([]);
		expect(schemaProblems).toHaveLength(1);
		expect(schemaProblems[0]).toContain('Column "issuer" on table "account"');

		const signUp = await signUpAndLinkSocialAccount(
			auth,
			"with-issuer-column@example.com",
		).catch((error: unknown) => error);
		expect(signUp).toBeInstanceOf(SchemaMismatchError);
		expect(signUp).toMatchObject({
			code: "SCHEMA_MISMATCH",
			findings: [
				{
					kind: "unexpected-required-column",
					table: "account",
					column: "issuer",
				},
			],
		});

		// A read meets the verdict kept from the first request.
		const read = await auth.api
			.getSession({ headers: new Headers() })
			.catch((error: unknown) => error);
		expect(read).toBe(signUp);
	});

	it("surfaces the raw constraint error when the check is disabled", async ({
		onTestFinished,
	}) => {
		const database = createDatabase(ACCOUNT_TABLE_WITH_ISSUER);
		onTestFinished(() => database.close());
		const { auth } = createAuth(database, {
			advanced: { database: { validateSchema: false } },
		});

		const error = await signUpAndLinkSocialAccount(
			auth,
			"unchecked@example.com",
		).catch((error: unknown) => error);
		expect(error).not.toBeInstanceOf(SchemaMismatchError);
		expect((error as Error).message).toMatch(/NOT NULL constraint failed/);
	});
});

describe("schema check with the adapter passed as a function", () => {
	it("accepts the plural table names the adapter uses", async ({
		onTestFinished,
	}) => {
		const database = new DatabaseSync(":memory:");
		onTestFinished(() => database.close());
		let ddl = [
			USER_TABLE,
			SESSION_TABLE,
			ACCOUNT_TABLE,
			VERIFICATION_TABLE,
		].join("\n");
		for (const table of ["user", "session", "account", "verification"]) {
			ddl = ddl.replaceAll(`"${table}"`, `"${table}s"`);
		}
		database.exec(ddl);
		const db = new Kysely({ dialect: new NodeSqliteDialect({ database }) });
		const { auth } = createAuth(database, {
			database: kyselyAdapter(db, { type: "sqlite", usePlural: true }),
		});

		await expect(
			auth.api.getSession({ headers: new Headers() }),
		).resolves.toBeNull();
	});

	it("rejects every request until the required issuer column is relaxed", async ({
		onTestFinished,
	}) => {
		const database = createDatabase(ACCOUNT_TABLE_WITH_ISSUER);
		onTestFinished(() => database.close());
		const db = new Kysely({ dialect: new NodeSqliteDialect({ database }) });
		const { auth } = createAuth(database, {
			database: kyselyAdapter(db, { type: "sqlite" }),
		});
		await expect(
			auth.api.getSession({ headers: new Headers() }),
		).rejects.toThrow(SchemaMismatchError);
	});
});

describe("schema check timing", () => {
	/**
	 * @see https://www.better-auth.com/docs/concepts/database#programmatic-migrations
	 */
	it("rechecks the schema after programmatic migrations", async ({
		onTestFinished,
	}) => {
		const database = new DatabaseSync(":memory:");
		onTestFinished(() => database.close());
		const { auth } = createAuth(database);
		await expect(
			auth.api.getSession({ headers: new Headers() }),
		).rejects.toThrow(SchemaMismatchError);

		await (await getMigrations(auth.options)).runMigrations();

		await expect(
			auth.api.signUpEmail({
				body: {
					email: "after-migration@example.com",
					password: "correct-horse-battery-staple",
					name: "Employee",
				},
			}),
		).resolves.toMatchObject({
			user: { email: "after-migration@example.com" },
		});
	});

	it("reports drift during initialization without an auth request", async ({
		onTestFinished,
	}) => {
		const database = createDatabase(ACCOUNT_TABLE_WITH_ISSUER);
		onTestFinished(() => database.close());
		const log = vi.fn();
		const { auth } = createAuth(database, { logger: { log } });

		await vi.waitFor(() => {
			expect(log).toHaveBeenCalledWith(
				"error",
				new SchemaMismatchError(
					[
						{
							kind: "unexpected-required-column",
							table: "account",
							column: "issuer",
						},
					],
					"database",
				).message,
			);
		});
		expect(
			database.prepare('select count(*) as count from "user"').get(),
		).toMatchObject({ count: 0 });
		await expect(
			auth.api.getSession({ headers: new Headers() }),
		).rejects.toThrow(SchemaMismatchError);
	});

	it("does not inspect the database when validation is disabled", async ({
		onTestFinished,
	}) => {
		const database = new DatabaseSync(":memory:");
		onTestFinished(() => database.close());
		const { auth, warnings } = createAuth(database, {
			advanced: { database: { validateSchema: false } },
		});
		const context = await auth.$context;

		expect(context.checkSchema).toBeUndefined();
		await expect(
			auth.api.getSession({ headers: new Headers() }),
		).resolves.toBeNull();
		expect(warnings).toEqual([]);
	});

	it("does not wait on a connection an ambient transaction holds", async ({
		onTestFinished,
	}) => {
		const database = createDatabase(ACCOUNT_TABLE);
		onTestFinished(() => database.close());
		const { auth } = createAuth(database, {
			database: {
				dialect: new NodeSqliteDialect({ database }),
				type: "sqlite",
				transaction: true,
			},
		});
		const { adapter } = await auth.$context;
		await expect(
			runWithTransaction(adapter, () =>
				auth.api.signUpEmail({
					body: {
						email: "in-transaction@example.com",
						password: "correct-horse-battery-staple",
						name: "Employee",
					},
				}),
			),
		).resolves.toMatchObject({ user: { email: "in-transaction@example.com" } });
	});
});

describe("schema check with Kysely's CamelCasePlugin", () => {
	const SNAKE_CASE_TABLES = `create table "user" ("id" text not null primary key, "name" text not null, "email" text not null unique, "email_verified" integer not null, "image" text, "created_at" date not null, "updated_at" date not null);
create table "session" ("id" text not null primary key, "expires_at" date not null, "token" text not null unique, "created_at" date not null, "updated_at" date not null, "ip_address" text, "user_agent" text, "user_id" text not null references "user" ("id") on delete cascade);
create table "account" ("id" text not null primary key, "account_id" text not null, "provider_id" text not null, "user_id" text not null references "user" ("id") on delete cascade, "access_token" text, "refresh_token" text, "id_token" text, "access_token_expires_at" date, "refresh_token_expires_at" date, "scope" text, "password" text, "created_at" date not null, "updated_at" date not null);
create table "verification" ("id" text not null primary key, "identifier" text not null, "value" text not null, "expires_at" date not null, "created_at" date not null, "updated_at" date not null);`;

	it("compares the names the plugin exposes, not the ones the database stores", async ({
		onTestFinished,
	}) => {
		const database = new DatabaseSync(":memory:");
		onTestFinished(() => database.close());
		database.exec(SNAKE_CASE_TABLES);
		const { auth } = createAuth(database, {
			database: {
				db: new Kysely({
					dialect: new NodeSqliteDialect({ database }),
					plugins: [new CamelCasePlugin()],
				}),
				type: "sqlite",
			},
		});
		await expect(
			auth.api.signUpEmail({
				body: {
					email: "snake@example.com",
					password: "correct-horse-battery-staple",
					name: "Employee",
				},
			}),
		).resolves.toMatchObject({ user: { email: "snake@example.com" } });
	});
});
