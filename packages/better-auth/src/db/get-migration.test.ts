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

		const { toBeAdded, runMigrations } = await getMigrations(config);

		const teamAdditions = toBeAdded.find((t) => t.table === "team");
		expect(teamAdditions?.fields).toHaveProperty("memberCount");
		const teamMemberAdditions = toBeAdded.find((t) => t.table === "teamMember");
		expect(teamMemberAdditions?.fields).toHaveProperty("membershipKey");

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
});
