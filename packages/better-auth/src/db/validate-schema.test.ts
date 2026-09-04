import { DatabaseSync } from "node:sqlite";
import { SchemaMismatchError } from "@better-auth/core/db/internal";
import { describe, expect, it } from "vitest";
import { betterAuth } from "../auth/full";
import type { BetterAuthOptions } from "../types";
import { getMigrations } from "./get-migration";

const legacyAccountTable = `
	DROP TABLE account;
	CREATE TABLE account (
		id TEXT NOT NULL PRIMARY KEY,
		accountId TEXT NOT NULL,
		providerId TEXT NOT NULL,
		issuer TEXT NOT NULL,
		userId TEXT NOT NULL REFERENCES user (id) ON DELETE CASCADE,
		accessToken TEXT,
		refreshToken TEXT,
		idToken TEXT,
		accessTokenExpiresAt DATE,
		refreshTokenExpiresAt DATE,
		scope TEXT,
		password TEXT,
		createdAt DATE NOT NULL,
		updatedAt DATE NOT NULL
	);
	CREATE UNIQUE INDEX account_issuer_accountId_uidx ON account (issuer, accountId);
`;

async function createMigratedDatabase(options: BetterAuthOptions) {
	await (await getMigrations(options)).runMigrations();
}

const baseOptions = {
	emailAndPassword: { enabled: true },
	logger: { disabled: true },
} satisfies BetterAuthOptions;

describe("database schema validation", () => {
	it("serves requests when the schema matches", async () => {
		const database = new DatabaseSync(":memory:");
		const options = { ...baseOptions, database };
		await createMigratedDatabase(options);
		const auth = betterAuth(options);

		const result = await auth.api.signUpEmail({
			body: { email: "ok@example.com", password: "password123", name: "Ok" },
		});
		expect(result.user.email).toBe("ok@example.com");
	});

	/**
	 * Better Auth 1.7.0 to 1.7.2 created `account.issuer` as a required column
	 * that is no longer written.
	 *
	 * @see https://github.com/better-auth/better-auth/pull/10403
	 */
	it("fails the first database call with the list of schema problems", async () => {
		const database = new DatabaseSync(":memory:");
		const options = { ...baseOptions, database };
		await createMigratedDatabase(options);
		database.exec(legacyAccountTable);
		database.exec("ALTER TABLE user DROP COLUMN image");
		const auth = betterAuth(options);

		const failure = await auth.api
			.signUpEmail({
				body: { email: "a@example.com", password: "password123", name: "A" },
			})
			.catch((error: unknown) => error);

		expect(failure).toBeInstanceOf(SchemaMismatchError);
		const message = String((failure as Error).message);
		expect(message).toContain('Column "image" is missing from table "user"');
		expect(message).toContain("npx auth migrate");
		expect(message).toContain('Column "issuer" on table "account" is required');
		expect(message).toContain("account_issuer_accountId_uidx");
		expect((failure as SchemaMismatchError).findings).toHaveLength(2);
	});

	it("validates before work that starts inside a transaction", async () => {
		const database = new DatabaseSync(":memory:");
		const options = { ...baseOptions, database };
		await createMigratedDatabase(options);
		database.exec(legacyAccountTable);
		const auth = betterAuth(options);
		const context = await auth.$context;

		await expect(
			context.adapter.transaction(async (tx) =>
				tx.findMany({ model: "user", where: [] }),
			),
		).rejects.toBeInstanceOf(SchemaMismatchError);
	});

	it("can be disabled", async () => {
		const database = new DatabaseSync(":memory:");
		const options = {
			...baseOptions,
			database,
			advanced: { database: { validateSchema: false } },
		} satisfies BetterAuthOptions;
		await createMigratedDatabase(options);
		database.exec(legacyAccountTable);
		const auth = betterAuth(options);

		const failure = await auth.api
			.signUpEmail({
				body: { email: "b@example.com", password: "password123", name: "B" },
			})
			.catch((error: unknown) => error);

		expect(failure).not.toBeInstanceOf(SchemaMismatchError);
		expect(String((failure as Error).message)).toMatch(/issuer/);
	});
});
