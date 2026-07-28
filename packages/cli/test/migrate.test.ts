import type { BetterAuthPlugin } from "@better-auth/core";
import { oauthProvider } from "@better-auth/oauth-provider";
import { scim } from "@better-auth/scim";
import { betterAuth } from "better-auth";
import { getMigrations } from "better-auth/db/migration";
import { jwt, organization } from "better-auth/plugins";
import { betterAuth as betterAuth1625 } from "better-auth-1-6-25";
import { getMigrations as getMigrations1625 } from "better-auth-1-6-25/db/migration";
import {
	oidcProvider as oidcProvider1625,
	organization as organization1625,
} from "better-auth-1-6-25/plugins";
import { scim as scim1625 } from "better-auth-scim-1-6-25";
import Database from "better-sqlite3";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { migrateAction } from "../src/commands/migrate";
import * as config from "../src/utils/get-config";

function backfill1625CredentialAccountIdentity(db: Database.Database) {
	db.exec(`
		ALTER TABLE account ADD COLUMN issuer TEXT;
		ALTER TABLE account ADD COLUMN providerAccountId TEXT;
		UPDATE account
		SET issuer = 'local:' || providerId,
			providerAccountId = accountId
		WHERE providerId = 'credential';
	`);
}

function enforce1625CredentialAccountIdentityConstraints(
	db: Database.Database,
) {
	db.exec(`
		PRAGMA foreign_keys = OFF;
		CREATE TABLE accountWithIdentity (
			id TEXT PRIMARY KEY NOT NULL,
			issuer TEXT NOT NULL,
			providerAccountId TEXT NOT NULL,
			providerId TEXT NOT NULL,
			userId TEXT NOT NULL REFERENCES user(id) ON DELETE CASCADE,
			accessToken TEXT,
			refreshToken TEXT,
			idToken TEXT,
			accessTokenExpiresAt INTEGER,
			refreshTokenExpiresAt INTEGER,
			scope TEXT,
			password TEXT,
			createdAt INTEGER NOT NULL,
			updatedAt INTEGER NOT NULL
		);
		INSERT INTO accountWithIdentity (
			id,
			issuer,
			providerAccountId,
			providerId,
			userId,
			accessToken,
			refreshToken,
			idToken,
			accessTokenExpiresAt,
			refreshTokenExpiresAt,
			scope,
			password,
			createdAt,
			updatedAt
		)
		SELECT
			id,
			issuer,
			providerAccountId,
			providerId,
			userId,
			accessToken,
			refreshToken,
			idToken,
			accessTokenExpiresAt,
			refreshTokenExpiresAt,
			scope,
			password,
			createdAt,
			updatedAt
		FROM account;
		DROP TABLE account;
		ALTER TABLE accountWithIdentity RENAME TO account;
		PRAGMA foreign_keys = ON;
	`);
}

describe("migrate base auth instance", () => {
	const db = new Database(":memory:");

	const auth = betterAuth({
		baseURL: "http://localhost:3000",
		database: db,
		emailAndPassword: {
			enabled: true,
		},
	});

	beforeEach(() => {
		vi.spyOn(process, "exit").mockImplementation((code) => {
			return code as never;
		});
		vi.spyOn(config, "getConfig").mockImplementation(async () => auth.options);
	});

	it("should migrate the database and sign-up a user", async () => {
		await migrateAction({
			cwd: process.cwd(),
			config: "test/auth.ts",
			yes: true,
		});
		const signUpRes = await auth.api.signUpEmail({
			body: {
				name: "test",
				email: "test@email.com",
				password: "password",
			},
		});
		expect(signUpRes.token).toBeDefined();
	});
});

describe("migrate auth instance with plugins", () => {
	const db = new Database(":memory:");
	const testPlugin = {
		id: "plugin",
		schema: {
			plugin: {
				fields: {
					test: {
						type: "string",
						fieldName: "test",
					},
				},
			},
		},
	} satisfies BetterAuthPlugin;

	const auth = betterAuth({
		baseURL: "http://localhost:3000",
		database: db,
		emailAndPassword: {
			enabled: true,
		},
		plugins: [testPlugin],
	});

	beforeEach(() => {
		vi.spyOn(process, "exit").mockImplementation((code) => {
			return code as never;
		});
		vi.spyOn(config, "getConfig").mockImplementation(async () => auth.options);
	});

	it("should migrate the database and sign-up a user", async () => {
		await migrateAction({
			cwd: process.cwd(),
			config: "test/auth.ts",
			yes: true,
		});
		const res = db
			.prepare("INSERT INTO plugin (id, test) VALUES (?, ?)")
			.run("1", "test");
		expect(res.changes).toBe(1);
	});
});

describe("migrate an index-only schema change", () => {
	const db = new Database(":memory:");
	const basePlugin = {
		id: "directory",
		schema: {
			directoryUser: {
				fields: {
					connectionId: { type: "string" },
					externalId: { type: "string" },
				},
			},
		},
	} satisfies BetterAuthPlugin;
	const indexedPlugin = {
		...basePlugin,
		schema: {
			directoryUser: {
				...basePlugin.schema.directoryUser,
				indexes: [
					{
						fields: ["connectionId", "externalId"],
						unique: true,
					},
				],
			},
		},
	} satisfies BetterAuthPlugin;
	let options = betterAuth({ database: db, plugins: [basePlugin] }).options;

	beforeEach(() => {
		vi.spyOn(process, "exit").mockImplementation((code) => code as never);
		vi.spyOn(config, "getConfig").mockImplementation(async () => options);
	});

	it("runs when only a compound index is missing", async () => {
		await migrateAction({ cwd: process.cwd(), yes: true });
		options = betterAuth({ database: db, plugins: [indexedPlugin] }).options;
		const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

		await migrateAction({ cwd: process.cwd(), yes: true });

		expect(consoleLog).not.toHaveBeenCalledWith("🚀 No migrations needed.");
		db.prepare(
			"INSERT INTO directoryUser (id, connectionId, externalId) VALUES (?, ?, ?)",
		).run("du1", "okta", "employee-1");
		expect(() =>
			db
				.prepare(
					"INSERT INTO directoryUser (id, connectionId, externalId) VALUES (?, ?, ?)",
				)
				.run("du2", "okta", "employee-1"),
		).toThrow();
	});
});

describe("inspect a migration without applying it", () => {
	it("shows a human-readable dry run and leaves the database unchanged", async () => {
		const db = new Database(":memory:");
		const auth = betterAuth({ database: db });
		vi.spyOn(config, "getConfig").mockImplementation(async () => auth.options);
		const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

		await migrateAction({ cwd: process.cwd(), dryRun: true });

		expect(consoleLog).toHaveBeenCalledWith("Target: kysely/sqlite");
		expect(consoleLog).toHaveBeenCalledWith("Blockers: none");
		expect(consoleLog).toHaveBeenCalledWith(
			"Dry run complete. No database changes were applied.",
		);
		expect(
			db
				.prepare(
					"SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table'",
				)
				.get(),
		).toEqual({ count: 0 });
	});

	it("prints a deterministic JSON plan and leaves the database unchanged", async () => {
		const db = new Database(":memory:");
		const auth = betterAuth({ database: db });
		vi.spyOn(config, "getConfig").mockImplementation(async () => auth.options);
		const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

		await migrateAction({ cwd: process.cwd(), json: true });

		expect(consoleLog).toHaveBeenCalledTimes(1);
		const migrationPlan = JSON.parse(String(consoleLog.mock.calls[0]?.[0])) as {
			changes: {
				createTables: Array<{ table: string }>;
			};
			formatVersion: number;
			status: string;
			target: { adapter: string; dialect: string };
		};
		expect(migrationPlan).toMatchObject({
			formatVersion: 1,
			status: "ready",
			target: {
				adapter: "kysely",
				dialect: "sqlite",
			},
		});
		expect(
			migrationPlan.changes.createTables.map(({ table }) => table),
		).toEqual(["account", "session", "user", "verification"]);
		expect(
			db
				.prepare(
					"SELECT COUNT(*) AS count FROM sqlite_master WHERE type = 'table'",
				)
				.get(),
		).toEqual({ count: 0 });
	});
});

describe("migrate published 1.6.25 account data", () => {
	it("blocks required identity columns before changing a populated account table", async () => {
		const db = new Database(":memory:");
		const auth1625 = betterAuth1625({
			baseURL: "http://localhost:3000",
			database: db,
			emailAndPassword: {
				enabled: true,
			},
		});
		await (await getMigrations1625(auth1625.options)).runMigrations();

		for (const user of [
			{ email: "ada@example.com", name: "Ada" },
			{ email: "grace@example.com", name: "Grace" },
		]) {
			await auth1625.api.signUpEmail({
				body: {
					...user,
					password: "correct-horse-battery-staple",
				},
			});
		}

		const sourceAccounts = db
			.prepare(
				"SELECT id, accountId, providerId, userId FROM account ORDER BY userId",
			)
			.all();
		expect(sourceAccounts).toHaveLength(2);

		const auth17 = betterAuth({
			baseURL: "http://localhost:3000",
			database: db,
			emailAndPassword: {
				enabled: true,
			},
		});
		const migration = await getMigrations(auth17.options);

		expect(migration.migrationBlockers).toContainEqual({
			code: "required-column-backfill",
			columns: ["issuer", "providerAccountId"],
			table: "account",
		});
		await expect(migration.runMigrations()).rejects.toThrow(
			'Migration blocked: existing table "account" contains rows and requires values for "issuer", "providerAccountId".',
		);

		const accountColumns = db
			.prepare("PRAGMA table_info(account)")
			.all()
			.map((column) => (column as { name: string }).name);
		expect(accountColumns).toContain("accountId");
		expect(accountColumns).not.toContain("issuer");
		expect(accountColumns).not.toContain("providerAccountId");

		vi.spyOn(config, "getConfig").mockImplementation(
			async () => auth17.options,
		);
		const processExit = vi
			.spyOn(process, "exit")
			.mockImplementation((code) => code as never);
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});

		await migrateAction({ cwd: process.cwd(), yes: true });

		expect(processExit).toHaveBeenCalledWith(1);
		expect(consoleError).toHaveBeenCalledWith(
			"Migration blocked. No database changes were applied.",
		);
		expect(consoleError).toHaveBeenCalledWith(
			"-> [required-column-backfill] account: existing rows need values for issuer, providerAccountId.",
		);

		processExit.mockClear();
		const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
		try {
			await migrateAction({ cwd: process.cwd(), from: "1.6", json: true });

			expect(processExit).not.toHaveBeenCalled();
			expect(process.exitCode).toBe(1);
			expect(consoleLog).toHaveBeenCalledTimes(1);
			const jsonPlan = JSON.parse(String(consoleLog.mock.calls[0]?.[0])) as {
				blockers: Array<{
					code: string;
					message: string;
				}>;
				formatVersion: number;
				status: string;
			};
			expect(jsonPlan).toMatchObject({
				blockers: [
					{
						code: "release-migration-preflight",
						message:
							"The 1.6 account migration requires an issuer for: credential.",
					},
				],
				formatVersion: 1,
				status: "blocked",
			});
		} finally {
			process.exitCode = undefined;
		}

		backfill1625CredentialAccountIdentity(db);
		const backfilledMigration = await getMigrations(auth17.options);
		expect(backfilledMigration.migrationBlockers).toContainEqual({
			code: "required-column-constraint",
			columns: ["issuer", "providerAccountId"],
			table: "account",
		});
		await expect(backfilledMigration.runMigrations()).rejects.toThrow(
			'Migration blocked: existing table "account" must make "issuer", "providerAccountId" non-nullable.',
		);
		await expect(backfilledMigration.compileMigrations()).rejects.toThrow(
			'Migration blocked: existing table "account" must make "issuer", "providerAccountId" non-nullable.',
		);

		enforce1625CredentialAccountIdentityConstraints(db);
		const reviewedMigration = await getMigrations(auth17.options);
		expect(reviewedMigration.migrationBlockers).toEqual([]);
		await reviewedMigration.runMigrations();

		for (const credentials of [
			{ email: "ada@example.com", name: "Ada" },
			{ email: "grace@example.com", name: "Grace" },
		]) {
			const signIn = await auth17.api.signInEmail({
				body: {
					email: credentials.email,
					password: "correct-horse-battery-staple",
				},
			});
			expect(signIn.user.name).toBe(credentials.name);
		}
	});
});

describe("migrate published 1.6.25 provider client data", () => {
	it("blocks before leaving registered clients in the retired table", async () => {
		const db = new Database(":memory:");
		const auth1625 = betterAuth1625({
			baseURL: "http://localhost:3000",
			database: db,
			emailAndPassword: {
				enabled: true,
			},
			plugins: [
				oidcProvider1625({
					allowDynamicClientRegistration: true,
					loginPage: "/login",
					schema: {
						oauthApplication: {
							modelName: "legacyOAuthApplication",
						},
					},
				}),
			],
		});
		await (await getMigrations1625(auth1625.options)).runMigrations();
		const registeredClient = await auth1625.api.registerOAuthApplication({
			body: {
				client_name: "Migration fixture",
				redirect_uris: ["https://client.example/callback"],
			},
		});
		expect(registeredClient.client_id).toBeTypeOf("string");
		expect(
			db.prepare("SELECT COUNT(*) AS count FROM legacyOAuthApplication").get(),
		).toEqual({ count: 1 });
		const sourceUser = await auth1625.api.signUpEmail({
			body: {
				email: "provider-owner@example.com",
				name: "Provider Owner",
				password: "correct-horse-battery-staple",
			},
		});
		const sourceContext = await auth1625.$context;
		const now = new Date();
		await sourceContext.adapter.create({
			model: "oauthAccessToken",
			data: {
				accessToken: crypto.randomUUID(),
				accessTokenExpiresAt: new Date(now.getTime() + 60_000),
				clientId: registeredClient.client_id,
				createdAt: now,
				refreshToken: crypto.randomUUID(),
				refreshTokenExpiresAt: new Date(now.getTime() + 120_000),
				scopes: "openid profile",
				updatedAt: now,
				userId: sourceUser.user.id,
			},
		});
		await sourceContext.adapter.create({
			model: "oauthConsent",
			data: {
				clientId: registeredClient.client_id,
				consentGiven: true,
				createdAt: now,
				scopes: "openid profile",
				updatedAt: now,
				userId: sourceUser.user.id,
			},
		});
		db.exec("DELETE FROM session; DELETE FROM account;");

		const auth17 = betterAuth({
			baseURL: "http://localhost:3000",
			database: db,
			plugins: [
				jwt(),
				oauthProvider({
					consentPage: "/consent",
					loginPage: "/login",
					silenceWarnings: {
						oauthAuthServerConfig: true,
						openidConfig: true,
					},
				}),
			],
		});
		const migration = await getMigrations(auth17.options, {
			legacyTableNames: {
				oauthApplication: "legacyOAuthApplication",
			},
		});

		expect(migration.migrationBlockers).toContainEqual({
			code: "table-data-move",
			migration: "1.7-provider-client-store",
			sourceTable: "legacyOAuthApplication",
			targetTable: "oauthClient",
		});
		expect(migration.migrationBlockers).toContainEqual({
			code: "retired-table-data",
			migration: "1.7-provider-token-store",
			table: "oauthAccessToken",
		});
		expect(migration.migrationBlockers).toContainEqual({
			code: "table-data-conversion",
			conversion: "space-delimited-string-to-string-array",
			migration: "1.7-provider-consent-store",
			sourceTable: "oauthConsent",
			targetTable: "oauthConsent",
		});
		expect(migration.migrationBlockers).not.toContainEqual(
			expect.objectContaining({
				code: "required-column-backfill",
				table: "oauthAccessToken",
			}),
		);
		await expect(migration.runMigrations()).rejects.toThrow(
			'Migration blocked: move rows from retired table "legacyOAuthApplication" to "oauthClient" before applying the schema migration.',
		);
		expect(
			db
				.prepare(
					"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'oauthClient'",
				)
				.get(),
		).toBeUndefined();
	});

	it("does not classify populated 1.7 token and consent tables as legacy", async () => {
		const db = new Database(":memory:");
		const auth17 = betterAuth({
			baseURL: "http://localhost:3000",
			database: db,
			plugins: [
				jwt(),
				oauthProvider({
					consentPage: "/consent",
					loginPage: "/login",
					silenceWarnings: {
						oauthAuthServerConfig: true,
						openidConfig: true,
					},
				}),
			],
		});
		await (await getMigrations(auth17.options)).runMigrations();
		const context = await auth17.$context;
		const now = new Date();
		const clientId = crypto.randomUUID();
		await context.adapter.create({
			model: "oauthClient",
			data: {
				clientId,
				createdAt: now,
				name: "Current fixture",
				redirectUris: ["https://current-client.example/callback"],
				updatedAt: now,
			},
		});
		await context.adapter.create({
			model: "oauthAccessToken",
			data: {
				clientId,
				createdAt: now,
				expiresAt: new Date(now.getTime() + 60_000),
				scopes: ["openid", "profile"],
				token: crypto.randomUUID(),
			},
		});
		await context.adapter.create({
			model: "oauthConsent",
			data: {
				clientId,
				createdAt: now,
				scopes: ["openid", "profile"],
				updatedAt: now,
			},
		});

		const migration = await getMigrations(auth17.options);

		expect(migration.migrationBlockers).toEqual([]);
	});
});

describe("migrate published 1.6.25 SCIM data", () => {
	it("requires a reviewed reprovision before creating the replacement models", async () => {
		const db = new Database(":memory:");
		const auth1625 = betterAuth1625({
			baseURL: "http://localhost:3000",
			database: db,
			emailAndPassword: {
				enabled: true,
			},
			plugins: [scim1625()],
		});
		await (await getMigrations1625(auth1625.options)).runMigrations();
		const credentials = {
			email: "scim-admin@example.com",
			name: "SCIM Admin",
			password: "correct-horse-battery-staple",
		};
		await auth1625.api.signUpEmail({ body: credentials });
		const signIn = await auth1625.api.signInEmail({
			body: {
				email: credentials.email,
				password: credentials.password,
			},
			returnHeaders: true,
		});
		const cookie = signIn.headers.getSetCookie()[0];
		if (!cookie) {
			throw new Error("Expected the 1.6.25 sign-in to set a session cookie");
		}
		const generated = await auth1625.api.generateSCIMToken({
			body: { providerId: "workforce-fixture" },
			headers: { cookie },
		});
		expect(generated.scimToken).toBeTypeOf("string");
		expect(
			db.prepare("SELECT COUNT(*) AS count FROM scimProvider").get(),
		).toEqual({ count: 1 });

		db.exec("DELETE FROM session; DELETE FROM account;");
		const migration = await getMigrations({
			database: db,
			plugins: [
				scim({
					connections: [
						{
							id: "workforce-fixture",
							credentials: [
								{
									type: "bearer",
									id: "fixture-token",
									token: "fixture-token",
								},
							],
						},
					],
				}),
			],
		});

		expect(migration.migrationBlockers).toContainEqual({
			code: "reprovision-data",
			migration: "1.7-scim",
			sourceTables: ["scimProvider"],
			targetTables: [
				"scimConnectionBinding",
				"scimIdentityTombstone",
				"scimSubject",
				"scimUser",
				"scimProjectionGrant",
				"scimGroup",
				"scimGroupMember",
			],
		});
		await expect(migration.runMigrations()).rejects.toThrow(
			'Migration blocked: back up and remove rows from retired SCIM table "scimProvider", then complete a full SCIM reprovision.',
		);
		expect(
			db
				.prepare(
					"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'scimConnectionBinding'",
				)
				.get(),
		).toBeUndefined();
	});
});

describe("migrate published 1.6.25 organization team data", () => {
	it("keeps legacy memberships and repairs the team counter on the first write", async () => {
		const db = new Database(":memory:");
		const auth1625 = betterAuth1625({
			baseURL: "http://localhost:3000",
			database: db,
			emailAndPassword: {
				enabled: true,
			},
			plugins: [
				organization1625({
					teams: {
						enabled: true,
					},
				}),
			],
		});
		await (await getMigrations1625(auth1625.options)).runMigrations();
		const owner = await auth1625.api.signUpEmail({
			body: {
				email: "team-owner@example.com",
				name: "Team Owner",
				password: "correct-horse-battery-staple",
			},
		});
		const teammate = await auth1625.api.signUpEmail({
			body: {
				email: "team-member@example.com",
				name: "Team Member",
				password: "correct-horse-battery-staple",
			},
		});
		const sourceOrganization = await auth1625.api.createOrganization({
			body: {
				name: "Migration fixture",
				slug: "migration-fixture",
				userId: owner.user.id,
			},
		});
		const sourceTeam = db
			.prepare("SELECT id FROM team WHERE organizationId = ?")
			.get(sourceOrganization?.id) as { id: string };
		expect(
			db
				.prepare(
					"SELECT COUNT(*) AS count FROM teamMember WHERE teamId = ? AND userId = ?",
				)
				.get(sourceTeam.id, owner.user.id),
		).toEqual({ count: 1 });

		backfill1625CredentialAccountIdentity(db);
		enforce1625CredentialAccountIdentityConstraints(db);
		const organizationOptions = {
			teams: {
				enabled: true as const,
				maximumMembersPerTeam: 2,
			},
		};
		const auth17 = betterAuth({
			baseURL: "http://localhost:3000",
			database: db,
			emailAndPassword: {
				enabled: true,
			},
			plugins: [organization(organizationOptions)],
		});
		const migration = await getMigrations(auth17.options);

		expect(migration.migrationBlockers).toEqual([]);
		await migration.runMigrations();
		expect(
			db
				.prepare("SELECT memberCount FROM team WHERE id = ?")
				.get(sourceTeam.id),
		).toEqual({ memberCount: 0 });
		expect(
			db
				.prepare(
					"SELECT membershipKey FROM teamMember WHERE teamId = ? AND userId = ?",
				)
				.get(sourceTeam.id, owner.user.id),
		).toEqual({ membershipKey: null });

		const added = await auth17.api.addMember({
			body: {
				organizationId: sourceOrganization?.id,
				role: "member",
				teamId: sourceTeam.id,
				userId: teammate.user.id,
			},
		});
		expect(added?.userId).toBe(teammate.user.id);
		expect(
			db
				.prepare("SELECT memberCount FROM team WHERE id = ?")
				.get(sourceTeam.id),
		).toEqual({ memberCount: 2 });
		expect(
			db
				.prepare("SELECT COUNT(*) AS count FROM teamMember WHERE teamId = ?")
				.get(sourceTeam.id),
		).toEqual({ count: 2 });
	});
});
