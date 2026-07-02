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
});
