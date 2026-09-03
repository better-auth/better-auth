import type { SQLInputValue } from "node:sqlite";
import { DatabaseSync } from "node:sqlite";
import type { BetterAuthOptions, BetterAuthPlugin } from "@better-auth/core";
import type { MigrationDatabaseQuery } from "@better-auth/core/db/adapter";
import { BetterAuthError } from "@better-auth/core/error";
import { describe, expect, it } from "vitest";
import { organization } from "../plugins/organization";
import {
	getMigrations,
	migrateFrom16,
	UnsafeMigrationError,
	validateMigrationFrom16,
} from "./get-migration";

// A 1.6-shape team/teamMember schema: the 1.7 `memberCount` and `membershipKey`
// columns are missing, so getMigrations must ADD them to a populated table.
function createLegacyOrgDb() {
	const db = new DatabaseSync(":memory:");
	db.exec(
		`CREATE TABLE "team" (
			"id" text primary key not null,
			"name" text not null,
			"organizationId" text not null,
			"createdAt" date not null,
			"updatedAt" date
		)`,
	);
	db.exec(
		`CREATE TABLE "teamMember" (
			"id" text primary key not null,
			"teamId" text not null,
			"userId" text not null,
			"createdAt" date
		)`,
	);
	db.exec(
		`INSERT INTO "team" ("id", "name", "organizationId", "createdAt")
		 VALUES ('t1', 'Engineering', 'org1', '2020-01-01')`,
	);
	db.exec(
		`INSERT INTO "teamMember" ("id", "teamId", "userId", "createdAt")
		 VALUES ('tm1', 't1', 'u1', '2020-01-01')`,
	);
	return db;
}

describe("get-migration: ALTER TABLE ADD COLUMN on SQLite", () => {
	it("blocks every schema change when a populated table needs a required column without a default", async () => {
		const db = new DatabaseSync(":memory:");
		db.exec(
			`CREATE TABLE "user" (
				"id" text primary key not null,
				"name" text not null,
				"email" text not null unique,
				"emailVerified" integer not null,
				"image" text,
				"createdAt" date not null,
				"updatedAt" date not null
			)`,
		);
		db.exec(
			`INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
			 VALUES ('u1', 'Ada', 'ada@example.com', 1, '2020-01-01', '2020-01-01')`,
		);
		const config: BetterAuthOptions = {
			database: db,
			user: {
				additionalFields: {
					tenantId: {
						type: "string",
						required: true,
					},
				},
			},
		};

		const migration = await getMigrations(config);

		expect(migration.migrationBlockers).toEqual([
			{
				code: "required-column-backfill",
				columns: ["tenantId"],
				table: "user",
			},
		]);
		await expect(migration.runMigrations()).rejects.toThrow(
			'Migration blocked: existing table "user" contains rows and requires values for "tenantId".',
		);
		await expect(migration.compileMigrations()).rejects.toThrow(
			'Migration blocked: existing table "user" contains rows and requires values for "tenantId".',
		);

		const userColumns = db
			.prepare("PRAGMA table_info(user)")
			.all()
			.map((column) => (column as { name: string }).name);
		expect(userColumns).not.toContain("tenantId");
		expect(
			db
				.prepare(
					"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'account'",
				)
				.get(),
		).toBeUndefined();
	});

	it("adds a required column with a static default and a unique column to a populated table", async () => {
		const db = createLegacyOrgDb();
		const config: BetterAuthOptions = {
			database: db,
			plugins: [organization({ teams: { enabled: true } })],
		};

		const { toBeAdded, runMigrations, compileMigrations } =
			await getMigrations(config);

		const teamAdditions = toBeAdded.find((t) => t.table === "team");
		expect(teamAdditions?.fields).toHaveProperty("memberCount");
		const teamMemberAdditions = toBeAdded.find((t) => t.table === "teamMember");
		expect(teamMemberAdditions?.fields).toHaveProperty("membershipKey");

		// The generated SQL (also what `auth generate` emits) carries a literal
		// default for the required column and a separate unique index for the
		// unique column, never an inline `ADD COLUMN ... UNIQUE`.
		const sql = (await compileMigrations()).toLowerCase();
		expect(sql).toContain(
			'add column "membercount" integer default 0 not null',
		);
		expect(sql).toContain("create unique index");
		expect(sql).not.toMatch(/add column "membershipkey"[^;]*unique/);
		// The NULL-filtered unique index is MSSQL-only.
		expect(sql).not.toMatch(/create unique index[^;]*where/);

		// SQLite rejects both `ADD COLUMN ... NOT NULL` without a default and
		// `ADD COLUMN ... UNIQUE`, so an unhardened generator throws here.
		await runMigrations();

		// The required column is backfilled with its schema default on the existing row.
		const team = db
			.prepare(`SELECT "memberCount" FROM "team" WHERE "id" = 't1'`)
			.get() as { memberCount: number };
		expect(team.memberCount).toBe(0);

		// The unique column is added and its uniqueness is enforced.
		db.exec(
			`INSERT INTO "teamMember" ("id", "teamId", "userId", "createdAt", "membershipKey")
			 VALUES ('tm2', 't1', 'u2', '2020-01-01', 'org1:t1:u2')`,
		);
		expect(() =>
			db.exec(
				`INSERT INTO "teamMember" ("id", "teamId", "userId", "createdAt", "membershipKey")
				 VALUES ('tm3', 't1', 'u3', '2020-01-01', 'org1:t1:u2')`,
			),
		).toThrow();
	});

	it("adds a required unique column with a static default when the table has one row", async () => {
		const db = new DatabaseSync(":memory:");
		db.exec(
			`CREATE TABLE "user" (
				"id" text primary key not null,
				"name" text not null,
				"email" text not null unique,
				"emailVerified" integer not null,
				"image" text,
				"createdAt" date not null,
				"updatedAt" date not null
			)`,
		);
		db.exec(
			`INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
			 VALUES ('u1', 'Ada', 'ada@example.com', 1, '2020-01-01', '2020-01-01')`,
		);
		const config: BetterAuthOptions = {
			database: db,
			user: {
				additionalFields: {
					referralCode: {
						type: "string",
						required: true,
						unique: true,
						defaultValue: "unset",
					},
				},
			},
		};

		const { runMigrations, compileMigrations } = await getMigrations(config);

		// A required unique column keeps its static default so the NOT NULL add
		// succeeds; uniqueness is enforced through a separate index.
		const sql = (await compileMigrations()).toLowerCase();
		expect(sql).toContain(
			`add column "referralcode" text default 'unset' not null`,
		);
		expect(sql).toContain('create unique index "user_referralcode_uidx"');

		await runMigrations();

		const user = db
			.prepare(`SELECT "referralCode" FROM "user" WHERE "id" = 'u1'`)
			.get() as { referralCode: string };
		expect(user.referralCode).toBe("unset");
	});

	it("blocks a shared default for a required unique column on a multi-row table", async () => {
		const db = new DatabaseSync(":memory:");
		db.exec(
			`CREATE TABLE "user" (
				"id" text primary key not null,
				"name" text not null,
				"email" text not null unique,
				"emailVerified" integer not null,
				"image" text,
				"createdAt" date not null,
				"updatedAt" date not null
			);
			INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
			VALUES
				('u1', 'Ada', 'ada@example.com', 1, '2020-01-01', '2020-01-01'),
				('u2', 'Grace', 'grace@example.com', 1, '2020-01-01', '2020-01-01');`,
		);
		const migration = await getMigrations({
			database: db,
			user: {
				additionalFields: {
					referralCode: {
						type: "string",
						required: true,
						unique: true,
						defaultValue: "unset",
					},
				},
			},
		});

		expect(migration.migrationBlockers).toEqual([
			{
				code: "required-column-backfill",
				columns: ["referralCode"],
				table: "user",
			},
		]);
		await expect(migration.runMigrations()).rejects.toThrow(
			'Migration blocked: existing table "user" contains rows and requires values for "referralCode".',
		);
	});
});

describe("get-migration: compound indexes on SQLite", () => {
	it("rejects duplicate field-level and table-level indexes before creating a table", async () => {
		await expect(
			getMigrations({
				database: new DatabaseSync(":memory:"),
				plugins: [
					{
						id: "directory",
						schema: {
							directoryUser: {
								fields: {
									subject: { type: "string", index: true },
								},
								indexes: [{ fields: ["subject"] }],
							},
						},
					},
				],
			}),
		).rejects.toThrow(
			'Database index name "directoryUser_subject_idx" is already reserved by field-level index metadata on table "directoryUser".',
		);
	});

	/**
	 * An index-definition conflict is a plain `BetterAuthError`, never the
	 * `UnsafeMigrationError` the CLI narrows its catch on. Callers that only
	 * check `instanceof UnsafeMigrationError` must let this rethrow instead
	 * of treating it as the populated-table column refusal.
	 */
	it("does not classify an index-definition conflict as UnsafeMigrationError", async () => {
		const error = await getMigrations({
			database: new DatabaseSync(":memory:"),
			plugins: [
				{
					id: "directory",
					schema: {
						directoryUser: {
							fields: {
								subject: { type: "string", index: true },
							},
							indexes: [{ fields: ["subject"] }],
						},
					},
				},
			],
		}).catch((caught: unknown) => caught);

		expect(error).toBeInstanceOf(BetterAuthError);
		expect(error).not.toBeInstanceOf(UnsafeMigrationError);
	});

	it("enforces a compound unique index with configured table and field names", async () => {
		const db = new DatabaseSync(":memory:");
		const config: BetterAuthOptions = {
			database: db,
			plugins: [
				{
					id: "directory",
					schema: {
						directoryUser: {
							modelName: "directory_user",
							fields: {
								connectionId: {
									type: "string",
									fieldName: "connection_id",
								},
								externalId: {
									type: "string",
									fieldName: "external_id",
								},
							},
							indexes: [
								{
									fields: ["connectionId", "externalId"],
									unique: true,
								},
							],
						},
					},
				},
			],
		};

		const migrations = await getMigrations(config);
		const sql = (await migrations.compileMigrations()).toLowerCase();

		expect(sql).toContain(
			'create unique index "directory_user_connection_id_external_id_uidx" on "directory_user" ("connection_id", "external_id")',
		);

		await migrations.runMigrations();
		db.exec(`
			INSERT INTO "directory_user" ("id", "connection_id", "external_id")
			VALUES
				('du1', 'okta', 'employee-1'),
				('du2', 'entra', 'employee-1');
		`);

		expect(() =>
			db.exec(`
				INSERT INTO "directory_user" ("id", "connection_id", "external_id")
				VALUES ('du3', 'okta', 'employee-1');
			`),
		).toThrow();

		const nextMigration = await getMigrations(config);
		expect(await nextMigration.compileMigrations()).not.toContain(
			"directory_user_connection_id_external_id_uidx",
		);
	});

	it("rejects an existing index with the requested name but different semantics", async () => {
		const db = new DatabaseSync(":memory:");
		db.exec(`
			CREATE TABLE "directory_user" (
				"id" text primary key not null,
				"connection_id" text not null,
				"external_id" text not null
			);
			CREATE INDEX "directory_identity_uidx"
				ON "directory_user" ("external_id");
		`);
		const config: BetterAuthOptions = {
			database: db,
			plugins: [
				{
					id: "directory",
					schema: {
						directoryUser: {
							modelName: "directory_user",
							fields: {
								connectionId: {
									type: "string",
									fieldName: "connection_id",
								},
								externalId: {
									type: "string",
									fieldName: "external_id",
								},
							},
							indexes: [
								{
									fields: ["connectionId", "externalId"],
									name: "directory_identity_uidx",
									unique: true,
								},
							],
						},
					},
				},
			],
		};

		await expect(getMigrations(config)).rejects.toThrow(
			'Database index "directory_identity_uidx" on table "directory_user" does not match the configured fields and uniqueness.',
		);
	});

	it("recognizes existing index names case-insensitively", async () => {
		const db = new DatabaseSync(":memory:");
		db.exec(`
			CREATE TABLE "directory_user" (
				"id" text primary key not null,
				"connection_id" text not null,
				"external_id" text not null
			);
			CREATE UNIQUE INDEX "Directory_Identity_UIDX"
				ON "directory_user" ("connection_id", "external_id");
		`);
		const migrations = await getMigrations({
			database: db,
			plugins: [
				{
					id: "directory",
					schema: {
						directoryUser: {
							modelName: "directory_user",
							fields: {
								connectionId: {
									type: "string",
									fieldName: "connection_id",
								},
								externalId: {
									type: "string",
									fieldName: "external_id",
								},
							},
							indexes: [
								{
									fields: ["connectionId", "externalId"],
									name: "directory_identity_uidx",
									unique: true,
								},
							],
						},
					},
				},
			],
		});

		expect(await migrations.compileMigrations()).not.toContain(
			"directory_identity_uidx",
		);
	});

	it("rejects a case-insensitive existing index name on another table", async () => {
		const db = new DatabaseSync(":memory:");
		db.exec(`
			CREATE TABLE "reserved_index_owner" (
				"id" text primary key not null,
				"subject" text not null
			);
			CREATE INDEX "Directory_Identity_UIDX"
				ON "reserved_index_owner" ("subject");
		`);

		await expect(
			getMigrations({
				database: db,
				plugins: [
					{
						id: "directory",
						schema: {
							directoryUser: {
								fields: { subject: { type: "string" } },
								indexes: [
									{
										fields: ["subject"],
										name: "directory_identity_uidx",
									},
								],
							},
						},
					},
				],
			}),
		).rejects.toThrow(
			'Database index name "directory_identity_uidx" is already used by table "reserved_index_owner".',
		);
	});

	it("does not accept a partial unique index as a full uniqueness guarantee", async () => {
		const db = new DatabaseSync(":memory:");
		db.exec(`
			CREATE TABLE "directory_user" (
				"id" text primary key not null,
				"connection_id" text not null,
				"external_id" text not null
			);
			CREATE UNIQUE INDEX "directory_identity_uidx"
				ON "directory_user" ("connection_id", "external_id")
				WHERE "external_id" IS NOT NULL;
		`);
		const config: BetterAuthOptions = {
			database: db,
			plugins: [
				{
					id: "directory",
					schema: {
						directoryUser: {
							modelName: "directory_user",
							fields: {
								connectionId: {
									type: "string",
									fieldName: "connection_id",
								},
								externalId: {
									type: "string",
									fieldName: "external_id",
								},
							},
							indexes: [
								{
									fields: ["connectionId", "externalId"],
									name: "directory_identity_uidx",
									unique: true,
								},
							],
						},
					},
				},
			],
		};

		await expect(getMigrations(config)).rejects.toThrow(
			'Database index "directory_identity_uidx" on table "directory_user" does not match the configured fields and uniqueness.',
		);
	});
});

const backfillGuide =
	"https://better-auth.com/docs/guides/1-7-upgrade-guide#choose-account-identity-strategy";

// A 1.6-shape account table. `issuer` is either absent (the 1.7 column has not
// been added yet) or present as a nullable column (added by hand without the
// documented NOT NULL step).
function createAccountDb({
	issuer,
	issuerColumn = "issuer",
	seeded = true,
}: {
	issuer?: "nullable" | "notNull";
	issuerColumn?: string;
	seeded?: boolean;
}) {
	const db = new DatabaseSync(":memory:");
	db.exec(
		`CREATE TABLE "user" (
			"id" text primary key not null,
			"name" text not null,
			"email" text not null unique,
			"emailVerified" integer not null,
			"image" text,
			"createdAt" date not null,
			"updatedAt" date not null
		)`,
	);
	const issuerDefinition =
		issuer === "nullable"
			? `"${issuerColumn}" text,`
			: issuer === "notNull"
				? `"${issuerColumn}" text not null,`
				: "";
	db.exec(
		`CREATE TABLE "account" (
			"id" text primary key not null,
			${issuerDefinition}
			"accountId" text not null,
			"providerId" text not null,
			"userId" text not null references "user" ("id"),
			"accessToken" text,
			"refreshToken" text,
			"idToken" text,
			"accessTokenExpiresAt" date,
			"refreshTokenExpiresAt" date,
			"scope" text,
			"password" text,
			"createdAt" date not null,
			"updatedAt" date not null
		)`,
	);
	if (!seeded) return db;
	db.exec(
		`INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
		 VALUES ('u1', 'Ada', 'ada@example.com', 1, '2020-01-01', '2020-01-01')`,
	);
	const issuerValue = issuer ? `, 'https://accounts.google.com'` : "";
	const issuerTarget = issuer ? `, "${issuerColumn}"` : "";
	db.exec(
		`INSERT INTO "account" ("id", "accountId", "providerId", "userId", "createdAt", "updatedAt"${issuerTarget})
		 VALUES ('a1', '10769150350006150715113082367', 'google', 'u1', '2020-01-01', '2020-01-01'${issuerValue})`,
	);
	return db;
}

// A required additional field whose live column was left nullable, on a table
// that has nothing to do with account identity.
function addNullableTierColumn(db: DatabaseSync) {
	db.exec(`ALTER TABLE "user" ADD COLUMN "tier" text`);
	db.exec(`UPDATE "user" SET "tier" = 'free'`);
	return db;
}

const tierField = {
	user: { additionalFields: { tier: { type: "string", required: true } } },
} satisfies BetterAuthOptions;

function captureFailure(promise: Promise<unknown>) {
	return promise.then(
		() => null,
		(error: unknown) => error,
	);
}

function warnLogger(warnings: string[]) {
	return {
		level: "warn" as const,
		log: (level: string, message: string) => {
			if (level === "warn") warnings.push(message);
		},
	};
}

describe("get-migration: unsafe schema changes on populated tables", () => {
	it("refuses to add a required column without a default to a populated table", async () => {
		const db = new DatabaseSync(":memory:");
		db.exec(
			`CREATE TABLE "directoryUser" (
				"id" text primary key not null,
				"externalId" text not null
			)`,
		);
		db.exec(
			`INSERT INTO "directoryUser" ("id", "externalId") VALUES ('du1', 'employee-1')`,
		);

		const { runMigrations, unsafeChanges } = await getMigrations({
			database: db,
			plugins: [
				{
					id: "directory",
					schema: {
						directoryUser: {
							fields: {
								externalId: { type: "string" },
								connectionIssuer: { type: "string", required: true },
							},
						},
					},
				},
			],
		});
		const failure = await captureFailure(runMigrations());

		expect(failure).toBeInstanceOf(BetterAuthError);
		expect(failure).toBeInstanceOf(UnsafeMigrationError);
		expect(unsafeChanges[0]).toContain(
			'Cannot add required column "connectionIssuer" to populated table "directoryUser"',
		);
		expect(unsafeChanges[0]).toContain("MySQL");
		expect(unsafeChanges[0]).toContain("empty string");
		expect(unsafeChanges[0]).not.toContain(backfillGuide);
	});

	/**
	 * @see https://better-auth.com/docs/guides/1-7-upgrade-guide#choose-account-identity-strategy
	 */
	it("refuses to add the account issuer column to a populated account table, pointing at the upgrade guide", async () => {
		const { runMigrations, unsafeChanges } = await getMigrations({
			account: { identityStrategy: "issuer" },
			database: createAccountDb({}),
		});
		const failure = await captureFailure(runMigrations());

		expect(failure).toBeInstanceOf(UnsafeMigrationError);
		expect(unsafeChanges[0]).toContain(
			'Cannot add required column "issuer" to populated table "account"',
		);
		expect(unsafeChanges[0]).toContain(backfillGuide);
	});

	it("points at the upgrade guide through a renamed issuer column", async () => {
		const { unsafeChanges } = await getMigrations({
			database: createAccountDb({ issuerColumn: "identity_issuer" }),
			account: {
				identityStrategy: "issuer",
				fields: { issuer: "identity_issuer" },
			},
		});

		expect(unsafeChanges[0]).toContain(
			'Cannot add required column "identity_issuer" to populated table "account"',
		);
		expect(unsafeChanges[0]).toContain(backfillGuide);
	});

	it("plans a required column without a default when the table is empty", async () => {
		const { compileMigrations, toBeAdded } = await getMigrations({
			account: { identityStrategy: "issuer" },
			database: createAccountDb({ seeded: false }),
		});

		expect(toBeAdded.find((t) => t.table === "account")?.fields).toHaveProperty(
			"issuer",
		);
		expect((await compileMigrations()).toLowerCase()).toContain(
			'add column "issuer" text not null',
		);
	});

	it("still adds a required column with a static default to a populated table", async () => {
		const db = new DatabaseSync(":memory:");
		db.exec(
			`CREATE TABLE "directoryUser" (
				"id" text primary key not null,
				"externalId" text not null
			)`,
		);
		db.exec(
			`INSERT INTO "directoryUser" ("id", "externalId") VALUES ('du1', 'employee-1')`,
		);

		const { compileMigrations, runMigrations } = await getMigrations({
			database: db,
			plugins: [
				{
					id: "directory",
					schema: {
						directoryUser: {
							fields: {
								externalId: { type: "string" },
								connectionIssuer: {
									type: "string",
									required: true,
									defaultValue: "local:directory",
								},
							},
						},
					},
				},
			],
		});

		expect((await compileMigrations()).toLowerCase()).toContain(
			`add column "connectionissuer" text default 'local:directory' not null`,
		);

		await runMigrations();

		const row = db
			.prepare(`SELECT "connectionIssuer" FROM "directoryUser"`)
			.get() as { connectionIssuer: string };
		expect(row.connectionIssuer).toBe("local:directory");
	});
});

describe("get-migration: nullable columns for required fields", () => {
	it("warns and blocks when a required field's live column is nullable", async () => {
		const db = addNullableTierColumn(createAccountDb({ issuer: "notNull" }));
		const warnings: string[] = [];

		const { runMigrations, toBeCreated } = await getMigrations({
			account: { identityStrategy: "issuer" },
			database: db,
			...tierField,
			logger: warnLogger(warnings),
			plugins: [
				{
					id: "directory",
					schema: {
						directoryUser: {
							fields: { externalId: { type: "string", required: true } },
						},
					},
				},
			],
		});

		expect(
			warnings.some((warning) =>
				warning.includes('Column "tier" on table "user"'),
			),
		).toBe(true);
		expect(toBeCreated.map((table) => table.table)).toContain("directoryUser");
		await expect(runMigrations()).rejects.toBeInstanceOf(UnsafeMigrationError);

		expect(
			db
				.prepare(
					`SELECT "name" FROM sqlite_master WHERE "name" = 'directoryUser'`,
				)
				.get(),
		).toBeUndefined();
	});

	it("accepts a required field whose live column is not null", async () => {
		const { compileMigrations, toBeAdded } = await getMigrations({
			account: { identityStrategy: "issuer" },
			database: createAccountDb({ issuer: "notNull" }),
		});

		expect(toBeAdded.find((t) => t.table === "account")).toBeUndefined();
		expect(await compileMigrations()).toContain(
			'create unique index "account_issuer_accountId_uidx"',
		);
	});

	it("warns with the real field and table name for the account issuer column", async () => {
		const warnings: string[] = [];

		await getMigrations({
			account: { identityStrategy: "issuer" },
			database: createAccountDb({ issuer: "nullable" }),
			logger: warnLogger(warnings),
		});

		expect(
			warnings.some((warning) =>
				warning.includes('Column "issuer" on table "account"'),
			),
		).toBe(true);
	});

	it("warns about both nullable drift and a type mismatch on the same column", async () => {
		const db = new DatabaseSync(":memory:");
		db.exec(
			`CREATE TABLE "directoryUser" (
				"id" text primary key not null,
				"seatCount" text
			)`,
		);
		db.exec(`INSERT INTO "directoryUser" ("id") VALUES ('du1')`);
		const warnings: string[] = [];

		await getMigrations({
			database: db,
			logger: warnLogger(warnings),
			plugins: [
				{
					id: "directory",
					schema: {
						directoryUser: {
							fields: { seatCount: { type: "number", required: true } },
						},
					},
				},
			],
		});

		expect(
			warnings.some((warning) =>
				warning.includes('Column "seatCount" on table "directoryUser"'),
			),
		).toBe(true);
		expect(
			warnings.some((warning) =>
				warning.includes(
					"Field seatCount in table directoryUser has a different type in the database",
				),
			),
		).toBe(true);
	});
});

describe("get-migration: inspecting a migration that cannot be applied", () => {
	it("reports the unsafe column change and still compiles the statements", async () => {
		const { compileMigrations, unsafeChanges } = await getMigrations(
			{
				account: { identityStrategy: "issuer" },
				database: createAccountDb({}),
			},
			{ throwOnUnsafe: false },
		);

		expect(unsafeChanges).toHaveLength(1);
		expect(unsafeChanges[0]).toContain(
			'Cannot add required column "issuer" to populated table "account"',
		);
		expect((await compileMigrations()).toLowerCase()).toContain(
			'alter table "account" add column "issuer" text not null',
		);
	});

	it("keeps the empty-string detail out of a non-text column's message", async () => {
		const db = new DatabaseSync(":memory:");
		db.exec(
			`CREATE TABLE "directoryUser" ("id" text primary key not null, "externalId" text not null)`,
		);
		db.exec(
			`INSERT INTO "directoryUser" ("id", "externalId") VALUES ('du1', 'employee-1')`,
		);

		const { unsafeChanges } = await getMigrations(
			{
				database: db,
				plugins: [
					{
						id: "directory",
						schema: {
							directoryUser: {
								fields: {
									externalId: { type: "string" },
									seatCount: { type: "number", required: true },
								},
							},
						},
					},
				],
			},
			{ throwOnUnsafe: false },
		);

		expect(unsafeChanges[0]).toContain(
			'Cannot add required column "seatCount" to populated table "directoryUser"',
		);
		expect(unsafeChanges[0]).toContain("implicit default for the column type");
		expect(unsafeChanges[0]).not.toContain("empty string");
	});
});

describe("get-migration: 1.6 release preflight", () => {
	const consentPlugin = {
		id: "release-preflight-fixture",
		schema: {
			oauthConsent: {
				fields: {
					clientId: { type: "string" },
					createdAt: { type: "date" },
					scopes: { type: "string[]" },
					updatedAt: { type: "date" },
					userId: { type: "string" },
				},
			},
		},
	} satisfies BetterAuthPlugin;

	function createLegacyOAuthClientTable(
		db: DatabaseSync,
		clientSecret: string,
	) {
		db.exec(
			`CREATE TABLE "oauthApplication" (
				"id" text primary key not null,
				"name" text not null,
				"icon" text,
				"metadata" text,
				"clientId" text not null,
				"clientSecret" text,
				"redirectUrls" text not null,
				"type" text not null,
				"disabled" integer,
				"userId" text,
				"createdAt" date not null,
				"updatedAt" date not null
			);
			INSERT INTO "oauthApplication" (
				"id", "name", "clientId", "clientSecret", "redirectUrls", "type",
				"createdAt", "updatedAt"
			) VALUES (
				'client-row', 'Confidential client', 'client-1', '${clientSecret}',
				'https://client.example/callback', 'web', '2020-01-01', '2020-01-01'
			)`,
		);
	}

	function createOAuthClientConfig(
		db: DatabaseSync,
		storeClientSecret: "encrypted" | "hashed",
	): BetterAuthOptions {
		return {
			database: db,
			plugins: [
				{
					id: "oauth-provider",
					options: { storeClientSecret },
					schema: {
						oauthClient: {
							fields: {
								clientId: { type: "string" },
								clientSecret: { type: "string", required: false },
								createdAt: { type: "date" },
								name: { type: "string" },
								redirectUris: { type: "string[]" },
								updatedAt: { type: "date" },
							},
						},
					},
				},
			],
		};
	}

	function createLegacyConsentTable(db: DatabaseSync, table: string) {
		db.exec(
			`CREATE TABLE "${table}" (
				"id" text primary key not null,
				"clientId" text not null,
				"userId" text not null,
				"scopes" text not null,
				"consentGiven" integer not null,
				"createdAt" date not null,
				"updatedAt" date not null
			)`,
		);
		db.exec(
			`INSERT INTO "${table}" ("id", "clientId", "userId", "scopes", "consentGiven", "createdAt", "updatedAt")
			 VALUES ('c1', 'client-1', 'u1', 'openid profile', 1, '2020-01-01', '2020-01-01')`,
		);
	}

	it("blocks an unsupported OAuth client secret storage transition", async () => {
		const db = new DatabaseSync(":memory:");
		createLegacyOAuthClientTable(db, "ciphertext");
		const config = createOAuthClientConfig(db, "hashed");

		await expect(
			validateMigrationFrom16(config, {
				oauthProvider: {
					clients: "migrate",
					clientSecrets: {
						source: "encrypted",
						target: "hashed",
					},
					consents: "reauthorize",
					tokens: "revoke",
				},
			}),
		).resolves.toEqual([
			{
				code: "oauth-client-secret-transition-unsupported",
				rowCount: 1,
				source: "encrypted",
				table: "oauthApplication",
				target: "hashed",
			},
		]);
	});

	it("blocks an OAuth client secret target that no longer matches the configuration", async () => {
		const db = new DatabaseSync(":memory:");
		createLegacyOAuthClientTable(db, "plaintext");
		const config = createOAuthClientConfig(db, "hashed");

		await expect(
			validateMigrationFrom16(config, {
				oauthProvider: {
					clients: "migrate",
					clientSecrets: {
						source: "plain",
						target: "encrypted",
					},
					consents: "reauthorize",
					tokens: "revoke",
				},
			}),
		).resolves.toEqual([
			{
				code: "oauth-client-secret-target-conflict",
				configuredTarget: "hashed",
				requestedTarget: "encrypted",
				table: "oauthApplication",
			},
		]);
	});

	it("reports every unresolved decision in one pass and still refuses to migrate", async () => {
		const db = new DatabaseSync(":memory:");
		db.exec(
			`CREATE TABLE "account" (
				"id" text primary key not null,
				"accountId" text not null,
				"providerId" text not null,
				"userId" text not null,
				"createdAt" date not null,
				"updatedAt" date not null
			)`,
		);
		db.exec(
			`INSERT INTO "account" ("id", "accountId", "providerId", "userId", "createdAt", "updatedAt")
			 VALUES
				('a1', 'ada@example.com', 'credential', 'u1', '2020-01-01', '2020-01-01'),
				('a2', '4711', 'github', 'u2', '2020-01-01', '2020-01-01')`,
		);
		createLegacyConsentTable(db, "oauthConsent");
		const config: BetterAuthOptions = {
			account: { identityStrategy: "issuer" },
			database: db,
			plugins: [consentPlugin],
		};

		await expect(validateMigrationFrom16(config, {})).resolves.toEqual([
			{
				accountCount: 2,
				code: "account-identity-strategy-unsupported",
				providerIds: ["credential", "github"],
				table: "account",
			},
			{
				code: "oauth-consent-decision-required",
				rowCount: 1,
				table: "oauthConsent",
			},
		]);
		await expect(migrateFrom16(config, {})).rejects.toThrow(
			'The 1.6 OAuth consent migration requires consents: "migrate" or "reauthorize".',
		);
	});

	it("reports a backup table that already holds the retired name", async () => {
		const db = new DatabaseSync(":memory:");
		createLegacyConsentTable(db, "oauthConsent");
		createLegacyConsentTable(db, "oauthConsent__better_auth_1_6");

		await expect(
			validateMigrationFrom16({ database: db, plugins: [consentPlugin] }, {}),
		).resolves.toEqual([
			{
				backupTable: "oauthConsent__better_auth_1_6",
				code: "backup-table-conflict",
				conflict: "backup-table-exists",
				table: "oauthConsent",
			},
		]);
	});

	describe("customized 1.6 table names", () => {
		function createUserTable(db: DatabaseSync) {
			db.exec(
				`CREATE TABLE "user" (
					"id" text primary key not null,
					"name" text not null,
					"email" text not null,
					"emailVerified" integer not null,
					"createdAt" date not null,
					"updatedAt" date not null
				)`,
			);
		}

		function createConfig(db: DatabaseSync): BetterAuthOptions {
			return { database: db, plugins: [consentPlugin] };
		}

		it("proposes the tables that hold a model's 1.6 columns", async () => {
			const db = new DatabaseSync(":memory:");
			createUserTable(db);
			createLegacyConsentTable(db, "legacyConsent");
			const config = createConfig(db);

			await expect(validateMigrationFrom16(config, {})).resolves.toEqual([
				{
					candidateTables: ["legacyConsent"],
					code: "legacy-table-candidate",
					model: "oauthConsent",
					table: "oauthConsent",
				},
			]);
			await expect(migrateFrom16(config, {})).rejects.toThrow(
				'The 1.6 migration found no "oauthConsent" data in "oauthConsent", and these tables hold the 1.6 "oauthConsent" columns: "legacyConsent".',
			);
		});

		it("migrates the proposed table once it is recorded", async () => {
			const db = new DatabaseSync(":memory:");
			createUserTable(db);
			createLegacyConsentTable(db, "legacyConsent");
			const config = createConfig(db);

			await expect(
				validateMigrationFrom16(config, {
					legacyTableNames: { oauthConsent: "legacyConsent" },
				}),
			).resolves.toEqual([
				{
					code: "oauth-consent-decision-required",
					rowCount: 1,
					table: "legacyConsent",
				},
			]);

			await migrateFrom16(config, {
				legacyTableNames: { oauthConsent: "legacyConsent" },
				oauthProvider: {
					clients: "migrate",
					clientSecrets: { source: "plain", target: "hashed" },
					consents: "migrate",
					tokens: "revoke",
				},
			});

			expect(
				db
					.prepare(
						`SELECT name FROM sqlite_master
						 WHERE type = 'table' AND name LIKE 'legacyConsent%'`,
					)
					.all()
					.map((table) => (table as { name: string }).name),
			).toEqual(["legacyConsent__better_auth_1_6"]);
			expect(
				db.prepare(`SELECT "clientId", "scopes" FROM "oauthConsent"`).all(),
			).toEqual([{ clientId: "client-1", scopes: '["openid","profile"]' }]);
		});

		it("leaves a rejected table alone once that is recorded", async () => {
			const db = new DatabaseSync(":memory:");
			createUserTable(db);
			createLegacyConsentTable(db, "legacyConsent");
			const config = createConfig(db);

			await expect(
				validateMigrationFrom16(config, {
					legacyTableNames: { oauthConsent: null },
				}),
			).resolves.toEqual([]);

			await migrateFrom16(config, {
				legacyTableNames: { oauthConsent: null },
			});

			expect(
				db.prepare(`SELECT COUNT(*) AS "count" FROM "legacyConsent"`).get(),
			).toEqual({ count: 1 });
		});

		it("proposes no table that already holds the 1.7 columns", async () => {
			const db = new DatabaseSync(":memory:");
			createUserTable(db);
			db.exec(
				`CREATE TABLE "oauthConsentArchive" (
					"id" text primary key not null,
					"clientId" text not null,
					"userId" text not null,
					"scopes" text not null,
					"consentGiven" integer not null,
					"requestedUserInfoClaims" text,
					"createdAt" date not null,
					"updatedAt" date not null
				)`,
			);
			db.exec(
				`INSERT INTO "oauthConsentArchive" ("id", "clientId", "userId", "scopes", "consentGiven", "createdAt", "updatedAt")
				 VALUES ('c1', 'client-1', 'u1', '["openid"]', 1, '2020-01-01', '2020-01-01')`,
			);

			await expect(
				validateMigrationFrom16(createConfig(db), {}),
			).resolves.toEqual([]);
		});
	});
});

describe("get-migration: 1.6 account issuer resolution", () => {
	function createLegacyAccountTable(db: DatabaseSync) {
		db.exec(
			`CREATE TABLE "account" (
				"id" text primary key not null,
				"accountId" text not null,
				"providerId" text not null,
				"userId" text not null,
				"createdAt" date not null,
				"updatedAt" date not null
			)`,
		);
		db.exec(
			`INSERT INTO "account" ("id", "accountId", "providerId", "userId", "createdAt", "updatedAt")
			 VALUES
				('a1', 'ada@example.com', 'credential', 'u1', '2020-01-01', '2020-01-01'),
				('a2', '4711', 'github', 'u2', '2020-01-01', '2020-01-01'),
				('a3', '108451', 'google', 'u3', '2020-01-01', '2020-01-01')`,
		);
	}

	const socialConfig = {
		github: { clientId: "github-client", clientSecret: "github-secret" },
		google: { clientId: "google-client", clientSecret: "google-secret" },
	};

	it("requires an explicit strategy for a populated 1.6 account table", async () => {
		const db = new DatabaseSync(":memory:");
		createLegacyAccountTable(db);
		const config: BetterAuthOptions = {
			database: db,
			socialProviders: socialConfig,
		};

		await expect(validateMigrationFrom16(config, {})).resolves.toEqual([
			{
				accountCount: 3,
				code: "account-identity-strategy-required",
				providerIds: ["credential", "github", "google"],
				table: "account",
			},
		]);
		await expect(migrateFrom16(config, {})).rejects.toThrow(
			'account: { identityStrategy: "provider-id" }',
		);
		expect(
			db
				.prepare(`PRAGMA table_info("account")`)
				.all()
				.map((column) => (column as { name: string }).name),
		).not.toContain("issuer");
	});

	it("refuses automatic issuer adoption for populated 1.6 data", async () => {
		const db = new DatabaseSync(":memory:");
		createLegacyAccountTable(db);
		const config: BetterAuthOptions = {
			account: { identityStrategy: "issuer" },
			database: db,
			socialProviders: socialConfig,
		};

		await expect(validateMigrationFrom16(config, {})).resolves.toEqual([
			expect.objectContaining({
				accountCount: 3,
				code: "account-identity-strategy-unsupported",
				providerIds: ["credential", "github", "google"],
			}),
		]);
		await expect(migrateFrom16(config, {})).rejects.toThrow(
			'account: { identityStrategy: "provider-id" }',
		);
	});

	it("reports every provider involved in a projected identity collision", async () => {
		const db = new DatabaseSync(":memory:");
		createLegacyAccountTable(db);
		db.exec(
			`INSERT INTO "account" ("id", "accountId", "providerId", "userId", "createdAt", "updatedAt")
			 VALUES ('a4', '108451', 'google', 'u4', '2020-01-01', '2020-01-01')`,
		);
		const config: BetterAuthOptions = {
			account: { identityStrategy: "provider-id" },
			database: db,
			socialProviders: socialConfig,
		};

		await expect(validateMigrationFrom16(config, {})).resolves.toContainEqual({
			code: "account-identity-collision",
			issuer: "local:oauth:google",
			providerAccountId: "108451",
			providerIds: ["google"],
			table: "account",
		});
		const migration = await getMigrations(config, { throwOnUnsafe: false });
		expect(migration.accountIdentity).toMatchObject({
			affectedProviders: ["google"],
			projectedCollisions: 1,
		});
	});

	it("refuses a partially populated account identity table", async () => {
		const db = new DatabaseSync(":memory:");
		db.exec(
			`CREATE TABLE "account" (
				"id" text primary key not null,
				"accountId" text not null,
				"issuer" text,
				"providerId" text not null,
				"userId" text not null,
				"createdAt" date not null,
				"updatedAt" date not null
			)`,
		);
		db.exec(
			`INSERT INTO "account" ("id", "accountId", "issuer", "providerId", "userId", "createdAt", "updatedAt")
			 VALUES
				('a1', 'g-1', NULL, 'google', 'u1', '2020-01-01', '2020-01-01'),
				('a2', 'g-2', 'https://accounts.google.com', 'google', 'u2', '2020-01-01', '2020-01-01')`,
		);
		const config: BetterAuthOptions = {
			account: { identityStrategy: "provider-id" },
			database: db,
			socialProviders: socialConfig,
		};

		const migration = await getMigrations(config, { throwOnUnsafe: false });
		expect(migration.migrationBlockers).toContainEqual(
			expect.objectContaining({
				code: "account-identity-strategy-mismatch",
				detectedStrategy: "mixed",
			}),
		);
		await expect(validateMigrationFrom16(config, {})).resolves.toEqual([
			expect.objectContaining({ code: "account-issuer-conflict" }),
		]);
	});

	it("plans the required issuer schema while the migration choice is omitted", async () => {
		const db = new DatabaseSync(":memory:");
		createLegacyAccountTable(db);
		const config: BetterAuthOptions = {
			database: db,
			socialProviders: socialConfig,
		};

		const migration = await getMigrations(config, { throwOnUnsafe: false });

		expect(migration.accountIdentity).toMatchObject({
			selectedStrategy: "issuer",
			detectedStrategy: "provider-id",
			migrationRequired: true,
		});
		expect(
			migration.toBeAdded.find(({ table }) => table === "account")?.fields,
		).toHaveProperty("issuer");
		expect(migration.toBeAddedIndexes).toContainEqual(
			expect.objectContaining({
				table: "account",
				index: expect.objectContaining({ columns: ["issuer", "accountId"] }),
			}),
		);
	});

	it.each([
		"provider-id",
		"issuer",
	] as const)("keeps an empty account table ready for an explicit %s strategy", async (identityStrategy) => {
		const db = new DatabaseSync(":memory:");
		db.exec(
			`CREATE TABLE "account" (
					"id" text primary key not null,
					"accountId" text not null,
					"providerId" text not null,
					"userId" text not null,
					"createdAt" date not null,
					"updatedAt" date not null
				)`,
		);
		const migration = await getMigrations(
			{ account: { identityStrategy }, database: db },
			{ throwOnUnsafe: false },
		);

		expect(migration.accountIdentity).toMatchObject({
			selectedStrategy: identityStrategy,
			detectedStrategy: "empty",
			migrationRequired: false,
			totalAccounts: 0,
		});
		expect(migration.migrationBlockers).toEqual([]);
	});

	it("keeps an empty account table on the omitted issuer compatibility path", async () => {
		const db = new DatabaseSync(":memory:");
		db.exec(
			`CREATE TABLE "account" (
				"id" text primary key not null,
				"accountId" text not null,
				"providerId" text not null,
				"userId" text not null,
				"createdAt" date not null,
				"updatedAt" date not null
			)`,
		);

		const migration = await getMigrations(
			{ database: db },
			{ throwOnUnsafe: false },
		);

		expect(migration.accountIdentity).toMatchObject({
			selectedStrategy: "issuer",
			detectedStrategy: "empty",
			migrationRequired: false,
			totalAccounts: 0,
			compatibilityWarning:
				'account.identityStrategy is omitted; Better Auth v1.7 compatibility mode is using issuer identity. Add account: { identityStrategy: "issuer" } to make this behavior explicit. For a new database, use account: { identityStrategy: "provider-id" } instead. Run auth migrate plan before changing populated account data.',
		});
		expect(migration.migrationBlockers).toEqual([]);
	});

	it("keeps an already-migrated v1.7 issuer database unchanged by default", async () => {
		const db = new DatabaseSync(":memory:");
		const publishedV17Config: BetterAuthOptions = {
			account: { identityStrategy: "issuer" },
			database: db,
			socialProviders: { google: socialConfig.google },
		};
		const publishedV17Migration = await getMigrations(publishedV17Config);
		await publishedV17Migration.runMigrations();
		db.exec(
			`INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
			 VALUES ('u1', 'Ada', 'ada@example.com', 1, '2020-01-01', '2020-01-01')`,
		);
		db.exec(
			`INSERT INTO "account" ("id", "accountId", "issuer", "providerId", "userId", "createdAt", "updatedAt")
			 VALUES ('a1', '108451', 'https://accounts.google.com', 'google', 'u1', '2020-01-01', '2020-01-01')`,
		);
		const config: BetterAuthOptions = {
			database: db,
			socialProviders: { google: socialConfig.google },
		};

		const migration = await getMigrations(config, { throwOnUnsafe: false });

		expect(migration.accountIdentity).toMatchObject({
			selectedStrategy: "issuer",
			detectedStrategy: "issuer",
			migrationRequired: false,
			compatibilityWarning:
				'account.identityStrategy is omitted; Better Auth v1.7 compatibility mode is using issuer identity. Add account: { identityStrategy: "issuer" } to make this behavior explicit. For a new database, use account: { identityStrategy: "provider-id" } instead. Run auth migrate plan before changing populated account data.',
		});
		expect(migration.migrationBlockers).not.toContainEqual(
			expect.objectContaining({ code: "account-identity-strategy-mismatch" }),
		);
		expect(
			migration.toBeAdded.find(({ table }) => table === "account"),
		).toBeUndefined();
		expect(
			migration.toBeAddedIndexes.find(({ table }) => table === "account"),
		).toBeUndefined();
		await expect(validateMigrationFrom16(config, {})).resolves.toEqual([]);
	});

	it("refuses omitted strategy when v1.7 data uses provider-id namespaces", async () => {
		const db = new DatabaseSync(":memory:");
		const providerConfig: BetterAuthOptions = {
			account: { identityStrategy: "provider-id" },
			database: db,
			socialProviders: { google: socialConfig.google },
		};
		const providerMigration = await getMigrations(providerConfig);
		await providerMigration.runMigrations();
		db.exec(
			`INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
			 VALUES ('u1', 'Ada', 'ada@example.com', 1, '2020-01-01', '2020-01-01')`,
		);
		db.exec(
			`INSERT INTO "account" ("id", "accountId", "issuer", "providerId", "userId", "createdAt", "updatedAt")
			 VALUES ('a1', '108451', 'local:oauth:google', 'google', 'u1', '2020-01-01', '2020-01-01')`,
		);

		const migration = await getMigrations(
			{ database: db, socialProviders: { google: socialConfig.google } },
			{ throwOnUnsafe: false },
		);

		expect(migration.migrationBlockers).toContainEqual(
			expect.objectContaining({
				code: "account-identity-strategy-mismatch",
				detectedStrategy: "provider-id",
			}),
		);
		const strictMigration = await getMigrations({
			database: db,
			socialProviders: { google: socialConfig.google },
		});
		await expect(strictMigration.runMigrations()).rejects.toThrow(
			'account: { identityStrategy: "provider-id" }',
		);
	});

	it("refuses malformed provider namespaces with counts and providers", async () => {
		const db = new DatabaseSync(":memory:");
		const config: BetterAuthOptions = {
			account: { identityStrategy: "provider-id" },
			database: db,
			socialProviders: { google: socialConfig.google },
		};
		const initialMigration = await getMigrations(config);
		await initialMigration.runMigrations();
		db.exec(
			`INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt")
			 VALUES ('u1', 'Ada', 'ada@example.com', 1, '2020-01-01', '2020-01-01')`,
		);
		db.exec(
			`INSERT INTO "account" ("id", "accountId", "issuer", "providerId", "userId", "createdAt", "updatedAt")
			 VALUES ('a1', '108451', 'local:oauth:github', 'google', 'u1', '2020-01-01', '2020-01-01')`,
		);

		const migration = await getMigrations(config, { throwOnUnsafe: false });

		expect(migration.accountIdentity).toMatchObject({
			affectedProviders: ["google"],
			detectedStrategy: "mixed",
			malformedNamespaces: 1,
			requiresRekey: true,
			totalAccounts: 1,
		});
		expect(migration.migrationBlockers).toContainEqual(
			expect.objectContaining({
				accountCount: 1,
				affectedProviders: ["google"],
				code: "account-identity-strategy-mismatch",
				malformedNamespaces: 1,
			}),
		);
		const strictMigration = await getMigrations(config);
		await expect(strictMigration.runMigrations()).rejects.toThrow(
			"contains 1 malformed persisted account namespace",
		);
	});

	it("preserves provider-scoped account identities when migrating from 1.6", async () => {
		const db = new DatabaseSync(":memory:");
		createLegacyAccountTable(db);
		const config: BetterAuthOptions = {
			account: { identityStrategy: "provider-id" },
			database: db,
			socialProviders: socialConfig,
		};

		await expect(validateMigrationFrom16(config, {})).resolves.toEqual([]);

		const migration = await migrateFrom16(config, {});
		expect(migration.accounts).toEqual({
			migrated: 3,
			providers: { credential: 1, github: 1, google: 1 },
		});
		expect(
			db
				.prepare(
					`SELECT "providerId", "issuer", "accountId" FROM "account" ORDER BY "providerId"`,
				)
				.all(),
		).toEqual([
			{
				issuer: "local:credential",
				accountId: "ada@example.com",
				providerId: "credential",
			},
			{
				issuer: "local:oauth:github",
				accountId: "4711",
				providerId: "github",
			},
			{
				issuer: "local:oauth:google",
				accountId: "108451",
				providerId: "google",
			},
		]);
	});

	it("derives provider namespaces for unconfigured legacy providers", async () => {
		const db = new DatabaseSync(":memory:");
		createLegacyAccountTable(db);
		const config: BetterAuthOptions = {
			account: { identityStrategy: "provider-id" },
			database: db,
		};

		await expect(validateMigrationFrom16(config, {})).resolves.toEqual([]);
		await migrateFrom16(config, {});

		expect(
			db
				.prepare(
					`SELECT "providerId", "issuer" FROM "account" ORDER BY "providerId"`,
				)
				.all(),
		).toEqual([
			{ issuer: "local:credential", providerId: "credential" },
			{ issuer: "local:oauth:github", providerId: "github" },
			{ issuer: "local:oauth:google", providerId: "google" },
		]);
	});
});

describe("get-migration: adapter migration connection", () => {
	it("plans and applies schema changes without a Kysely adapter", async () => {
		const sqlite = new DatabaseSync(":memory:");
		const config: BetterAuthOptions = {
			database: () =>
				({
					id: "drizzle",
					options: {
						adapterConfig: {
							adapterId: "drizzle",
							migrationConnection: {
								dialect: "sqlite",
								async execute(query: MigrationDatabaseQuery) {
									const parameters =
										query.parameters as readonly SQLInputValue[];
									if (/^\s*(?:PRAGMA|SELECT|WITH)\b/i.test(query.sql)) {
										return {
											rows: sqlite.prepare(query.sql).all(...parameters),
										};
									}
									const write = sqlite.prepare(query.sql).run(...parameters);
									return {
										insertId: BigInt(write.lastInsertRowid),
										numAffectedRows: BigInt(write.changes),
										rows: [],
									};
								},
							},
						},
					},
				}) as never,
		};

		const migration = await getMigrations(config);

		expect(migration.migrationTarget).toEqual({
			adapter: "drizzle",
			dialect: "sqlite",
		});
		expect(migration.toBeCreated.map(({ table }) => table)).toContain("user");
		await migration.runMigrations();
		expect(
			sqlite
				.prepare(
					"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'user'",
				)
				.get(),
		).toEqual({ name: "user" });
	});
});
