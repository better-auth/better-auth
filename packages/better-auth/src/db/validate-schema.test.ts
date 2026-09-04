import { DatabaseSync } from "node:sqlite";
import { SchemaMismatchError } from "@better-auth/core/db/internal";
import type { TableMetadata } from "kysely";
import { describe, expect, it, vi } from "vitest";
import { betterAuth } from "../auth/full";
import { twoFactor } from "../plugins/two-factor";
import type { BetterAuthOptions } from "../types";
import { getMigrations } from "./get-migration";
import { selectVisibleTables, withSchemaValidation } from "./validate-schema";

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

	it("warns instead of failing when only a plugin table is wrong", async () => {
		const database = new DatabaseSync(":memory:");
		const log = vi.fn();
		const options = {
			...baseOptions,
			database,
			logger: { log },
			plugins: [twoFactor()],
		} satisfies BetterAuthOptions;
		await createMigratedDatabase(options);
		database.exec("DROP TABLE twoFactor");
		const auth = betterAuth(options);

		const result = await auth.api.signUpEmail({
			body: { email: "p@example.com", password: "password123", name: "P" },
		});
		expect(result.user.email).toBe("p@example.com");
		expect(log).toHaveBeenCalledWith(
			"warn",
			expect.stringContaining('Table "twoFactor" is missing'),
		);
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

describe("withSchemaValidation", () => {
	const makeAdapter = () => {
		const findOne = vi.fn(async () => "row");
		return {
			adapter: { findOne } as unknown as Parameters<
				typeof withSchemaValidation
			>[0],
			findOne,
		};
	};

	it("keeps a schema mismatch without querying the database again", async () => {
		const { adapter } = makeAdapter();
		const validate = vi.fn(async () => {
			throw new SchemaMismatchError("mismatch", []);
		});
		const guarded = withSchemaValidation(adapter, validate, { warn: vi.fn() });

		await expect(guarded.findOne({ model: "user", where: [] })).rejects.toBe(
			await validate.mock.results[0]?.value.catch((error: unknown) => error),
		);
		await expect(
			guarded.findOne({ model: "user", where: [] }),
		).rejects.toBeInstanceOf(SchemaMismatchError);
		expect(validate).toHaveBeenCalledTimes(1);
	});

	it("continues with a warning when the schema cannot be read", async () => {
		const { adapter, findOne } = makeAdapter();
		const validate = vi.fn(async () => {
			throw new Error("introspection unsupported");
		});
		const warn = vi.fn();
		const guarded = withSchemaValidation(adapter, validate, { warn });

		await expect(guarded.findOne({ model: "user", where: [] })).resolves.toBe(
			"row",
		);
		await guarded.findOne({ model: "user", where: [] });
		expect(findOne).toHaveBeenCalledTimes(2);
		expect(validate).toHaveBeenCalledTimes(1);
		expect(warn).toHaveBeenCalledTimes(1);
	});
});

describe("selectVisibleTables", () => {
	const table = (schema: string, name: string): TableMetadata => ({
		schema,
		name,
		isView: false,
		columns: [],
	});

	it("prefers the current schema and falls back to other schemas on the search path", () => {
		const selected = selectVisibleTables(
			[
				table("public", "user"),
				table("auth", "user"),
				table("auth", "session"),
				table("archive", "session"),
				table("archive", "account"),
			],
			"public",
		);
		expect(selected.map((t) => `${t.schema}.${t.name}`)).toEqual([
			"public.user",
			"auth.session",
			"archive.account",
		]);
	});
});
