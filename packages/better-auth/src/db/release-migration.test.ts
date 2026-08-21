import { DatabaseSync } from "node:sqlite";
import type { BetterAuthOptions } from "@better-auth/core";
import { describe, expect, it } from "vitest";
import { getMigrationDatabase } from "./migration-database";
import type {
	LegacyReleaseDataState,
	MigrateFrom16Options,
} from "./release-migration";
import {
	inspectScimAccountsFrom16,
	retireScimAccountsFrom16,
} from "./release-migration";

function createScimRetirementFixture() {
	const database = new DatabaseSync(":memory:");
	database.exec(`
		CREATE TABLE "scimProvider" (
			"id" text primary key not null,
			"providerId" text not null
		);
		CREATE TABLE "account" (
			"id" text primary key not null,
			"accountId" text not null,
			"providerId" text not null,
			"userId" text not null
		);
		INSERT INTO "scimProvider" ("id", "providerId")
		VALUES ('sp1', 'workforce');
		INSERT INTO "account" ("id", "accountId", "providerId", "userId")
		VALUES ('a1', 'ada@example.com', 'workforce', 'u1');
	`);
	const config: BetterAuthOptions = { database };
	const options: MigrateFrom16Options = {
		scim: {
			accountIdsToRetire: ["a1"],
			providers: "reprovision",
		},
	};
	const state: LegacyReleaseDataState = {
		scimProvider: {
			backupTable: "scimProvider__better_auth_1_6",
			rowCount: 1,
			sourceTable: "scimProvider",
			sourceTableNeedsRename: true,
		},
	};
	return { config, database, options, state };
}

describe("1.6 SCIM account retirement", () => {
	/**
	 * @see https://github.com/better-auth/better-auth/pull/10575#discussion_r3831145554
	 */
	it("requires a transaction before deleting MySQL SCIM accounts", async () => {
		const { config, database, options, state } = createScimRetirementFixture();
		const migrationDatabase = await getMigrationDatabase(config);
		const inspectedAccounts = await inspectScimAccountsFrom16(
			config,
			options,
			state,
		);

		await expect(
			retireScimAccountsFrom16(config, options, state, inspectedAccounts, {
				...migrationDatabase,
				databaseType: "mysql",
				transaction: undefined,
			}),
		).rejects.toThrow(
			"must expose a transaction-scoped migration connection before Better Auth can safely retire populated 1.6 SCIM accounts on MySQL",
		);
		expect(
			database.prepare(`SELECT "id" FROM "account" ORDER BY "id"`).all(),
		).toEqual([{ id: "a1" }]);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10575
	 */
	it("revalidates the reviewed inventory immediately before deleting accounts", async () => {
		const { config, database, options, state } = createScimRetirementFixture();
		const inspectedAccounts = await inspectScimAccountsFrom16(
			config,
			options,
			state,
		);
		database.exec(`
			INSERT INTO "account" ("id", "accountId", "providerId", "userId")
			VALUES ('a2', 'grace@example.com', 'workforce', 'u2');
		`);

		await expect(
			retireScimAccountsFrom16(config, options, state, inspectedAccounts),
		).rejects.toThrow("Missing: a2");
		expect(
			database.prepare(`SELECT COUNT(*) AS "count" FROM "account"`).get(),
		).toEqual({ count: 2 });
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10575#discussion_r3830692475
	 */
	it("detects an account inserted while the reviewed inventory is being retired", async () => {
		const { config, database, options, state } = createScimRetirementFixture();
		database.exec(`
			CREATE TRIGGER "insert_scim_account_during_retirement"
			AFTER DELETE ON "account"
			WHEN OLD."id" = 'a1'
			BEGIN
				INSERT INTO "account" ("id", "accountId", "providerId", "userId")
				VALUES ('a2', 'grace@example.com', 'workforce', 'u2');
			END;
		`);
		const inspectedAccounts = await inspectScimAccountsFrom16(
			config,
			options,
			state,
		);

		const retirement = retireScimAccountsFrom16(
			config,
			options,
			state,
			inspectedAccounts,
		);
		await expect(retirement).rejects.toThrow("Missing: a2");
		expect(
			database.prepare(`SELECT "id" FROM "account" ORDER BY "id"`).all(),
		).toEqual([{ id: "a2" }]);
	});
});
