import { DatabaseSync } from "node:sqlite";
import type { BetterAuthOptions } from "@better-auth/core";
import { describe, expect, it } from "vitest";
import { organization } from "../plugins/organization";
import { getMigrations } from "./get-migration";

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
		const warnings: string[] = [];
		const config: BetterAuthOptions = {
			database: db,
			logger: {
				level: "warn",
				log: (level, message) => {
					if (level === "warn") warnings.push(message);
				},
			},
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

		// The shared backfill cannot be unique on a multi-row table, so the
		// generator warns that a manual backfill may be needed.
		expect(warnings.some((w) => w.includes('"referralCode"'))).toBe(true);

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
