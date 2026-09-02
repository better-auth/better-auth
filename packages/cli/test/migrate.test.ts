import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { BetterAuthOptions, BetterAuthPlugin } from "@better-auth/core";
import { oauthProvider } from "@better-auth/oauth-provider";
import { scim } from "@better-auth/scim";
import { betterAuth } from "better-auth";
import * as releaseMigration from "better-auth/db/migration";
import {
	getMigrations,
	validateMigrationFrom16,
} from "better-auth/db/migration";
import { jwt, organization } from "better-auth/plugins";
import { betterAuth as betterAuth1630 } from "better-auth-1-6-30";
import { getMigrations as getMigrations1630 } from "better-auth-1-6-30/db/migration";
import {
	oidcProvider as oidcProvider1630,
	organization as organization1630,
} from "better-auth-1-6-30/plugins";
import { scim as scim1630 } from "better-auth-scim-1-6-30";
import Database from "better-sqlite3";
import prompts from "prompts";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Spinner } from "yocto-spinner";
import yoctoSpinner from "yocto-spinner";
import {
	createMigrateCommand,
	migrateAction,
	printHumanMigrationPlan,
} from "../src/commands/migrate";
import { createMigrationPlan } from "../src/commands/migration-plan";
import * as config from "../src/utils/get-config";

vi.mock("prompts", () => ({
	default: vi.fn(),
}));
vi.mock(import("yocto-spinner"), () => ({
	default: vi.fn(() => {
		const spinner: Spinner = {
			text: "",
			color: "cyan",
			start: vi.fn(() => spinner),
			stop: vi.fn(() => spinner),
			success: vi.fn(() => spinner),
			error: vi.fn(() => spinner),
			warning: vi.fn(() => spinner),
			info: vi.fn(() => spinner),
			clear: vi.fn(() => spinner),
			get isSpinning() {
				return false;
			},
		};
		return spinner;
	}),
}));

function backfill1630CredentialAccountIdentity(db: Database.Database) {
	db.exec(`
		ALTER TABLE account ADD COLUMN issuer TEXT;
		UPDATE account
		SET issuer = 'local:' || providerId
		WHERE providerId = 'credential';
	`);
}

function enforce1630CredentialAccountIdentityConstraints(
	db: Database.Database,
) {
	db.exec(`
		PRAGMA foreign_keys = OFF;
		CREATE TABLE accountWithIdentity (
			id TEXT PRIMARY KEY NOT NULL,
			issuer TEXT NOT NULL,
			accountId TEXT NOT NULL,
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
			accountId,
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
			accountId,
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
			approved: true,
			cwd: process.cwd(),
			config: "test/auth.ts",
			mode: "apply",
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
			approved: true,
			cwd: process.cwd(),
			config: "test/auth.ts",
			mode: "apply",
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
		await migrateAction({
			approved: true,
			cwd: process.cwd(),
			mode: "apply",
		});
		options = betterAuth({ database: db, plugins: [indexedPlugin] }).options;
		const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

		await migrateAction({
			approved: true,
			cwd: process.cwd(),
			mode: "apply",
		});

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

		await migrateAction({ cwd: process.cwd(), mode: "plan" });

		expect(consoleLog).toHaveBeenCalledWith("Target: kysely/sqlite");
		expect(consoleLog).toHaveBeenCalledWith("Blockers: none");
		expect(consoleLog).toHaveBeenCalledWith(
			"No database changes were applied.",
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

		await migrateAction({
			cwd: process.cwd(),
			mode: "plan",
			outputFormat: "json",
		});

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

describe("migration plan status", () => {
	/**
	 * @see https://github.com/better-auth/better-auth/pull/10575#discussion_r3830648973
	 */
	it("reports pending release work when the schema is already current", () => {
		const plan = createMigrationPlan({
			accountIdentity: {
				selectedStrategy: "provider-id",
				detectedStrategy: "provider-id",
				migrationRequired: false,
				requiresRekey: false,
			},
			hasChanges: false,
			migrationBlockers: [],
			migrationTarget: { adapter: "kysely", dialect: "sqlite" },
			releaseMigration: {
				actions: ["write the 1.7 account identity"],
				id: "1.6-to-1.7",
			},
			toBeAdded: [],
			toBeAddedIndexes: [],
			toBeCreated: [],
		});

		expect(plan.status).toBe("ready");
	});

	it("prints blocker details and remediation in the human plan", () => {
		const plan = createMigrationPlan({
			accountIdentity: {
				selectedStrategy: "issuer",
				detectedStrategy: "provider-id",
				migrationRequired: true,
				requiresRekey: false,
			},
			hasChanges: true,
			migrationBlockers: [
				{
					code: "required-column-backfill",
					columns: ["issuer"],
					table: "account",
				},
			],
			migrationTarget: { adapter: "drizzle", dialect: "postgres" },
			toBeAdded: [],
			toBeAddedIndexes: [],
			toBeCreated: [],
		});
		const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

		printHumanMigrationPlan(plan, [], [], []);

		expect(consoleLog).toHaveBeenCalledWith(
			"->",
			"account: existing rows need values for issuer.",
		);
		expect(consoleLog).toHaveBeenCalledWith(
			"   Remediation:",
			'Backfill issuer for every row in "account", then run `auth migrate apply` again.',
		);
	});
});

describe("migrate published 1.6.30 account data", () => {
	/**
	 * @see https://github.com/better-auth/better-auth/pull/10575#discussion_r3812055040
	 */
	it("keeps unrelated required account fields in the CLI migration plan", async () => {
		const db = new Database(":memory:");
		const auth1630 = betterAuth1630({
			baseURL: "http://localhost:3000",
			database: db,
			emailAndPassword: { enabled: true },
		});
		await (await getMigrations1630(auth1630.options)).runMigrations();
		await auth1630.api.signUpEmail({
			body: {
				email: "ada@example.com",
				name: "Ada",
				password: "correct-horse-battery-staple",
			},
		});

		const auth17 = betterAuth({
			account: { identityStrategy: "provider-id" },
			baseURL: "http://localhost:3000",
			database: db,
			plugins: [
				{
					id: "required-account-field",
					schema: {
						account: {
							fields: {
								externalKey: {
									required: true,
									type: "string",
								},
							},
						},
					},
				},
			],
		});
		vi.spyOn(config, "getConfig").mockImplementation(
			async () => auth17.options,
		);
		vi.spyOn(process, "exit").mockImplementation((code) => code as never);
		const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

		try {
			await migrateAction({
				cwd: process.cwd(),
				mode: "plan",
				outputFormat: "json",
			});

			const migrationPlan = JSON.parse(
				String(consoleLog.mock.calls[0]?.[0]),
			) as {
				blockers: Array<{ code: string; columns?: string[] }>;
				status: string;
			};
			expect(migrationPlan.status).toBe("blocked");
			expect(migrationPlan.blockers).toEqual(
				expect.arrayContaining([
					expect.objectContaining({
						code: "required-column-backfill",
						columns: expect.arrayContaining(["externalKey"]),
					}),
				]),
			);
			expect(
				db
					.prepare("PRAGMA table_info(account)")
					.all()
					.map((column) => (column as { name: string }).name),
			).not.toContain("issuer");
		} finally {
			process.exitCode = undefined;
		}
	});

	it("blocks required identity columns before changing a populated account table", async () => {
		const db = new Database(":memory:");
		const auth1630 = betterAuth1630({
			baseURL: "http://localhost:3000",
			database: db,
			emailAndPassword: {
				enabled: true,
			},
		});
		await (await getMigrations1630(auth1630.options)).runMigrations();

		for (const user of [
			{ email: "ada@example.com", name: "Ada" },
			{ email: "grace@example.com", name: "Grace" },
		]) {
			await auth1630.api.signUpEmail({
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
			account: { identityStrategy: "provider-id" },
			baseURL: "http://localhost:3000",
			database: db,
			emailAndPassword: {
				enabled: true,
			},
		});
		const migration = await getMigrations(auth17.options);

		expect(migration.migrationBlockers).toContainEqual({
			code: "required-column-backfill",
			columns: ["issuer"],
			table: "account",
		});
		await expect(migration.runMigrations()).rejects.toThrow(
			'Migration blocked: existing table "account" contains rows and requires values for "issuer".',
		);

		const accountColumns = db
			.prepare("PRAGMA table_info(account)")
			.all()
			.map((column) => (column as { name: string }).name);
		expect(accountColumns).toContain("accountId");
		expect(accountColumns).not.toContain("issuer");

		vi.spyOn(config, "getConfig").mockImplementation(
			async () => auth17.options,
		);
		const processExit = vi
			.spyOn(process, "exit")
			.mockImplementation((code) => code as never);
		const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

		await migrateAction({ cwd: process.cwd(), mode: "plan" });

		expect(processExit).not.toHaveBeenCalled();
		expect(consoleLog).toHaveBeenCalledWith("Blockers: none");
		expect(consoleLog).toHaveBeenCalledWith("Release migration: 1.6-to-1.7");
		expect(consoleLog).toHaveBeenCalledWith(
			"->",
			"write the 1.7 account identity onto every existing account row",
		);
		expect(consoleLog).toHaveBeenCalledWith(
			"No database changes were applied.",
		);
		expect(
			db
				.prepare("PRAGMA table_info(account)")
				.all()
				.map((column) => (column as { name: string }).name),
		).not.toContain("issuer");

		consoleLog.mockClear();
		await migrateAction({
			cwd: process.cwd(),
			mode: "plan",
			outputFormat: "json",
		});

		expect(processExit).not.toHaveBeenCalled();
		expect(process.exitCode).toBeUndefined();
		expect(consoleLog).toHaveBeenCalledTimes(1);
		const jsonPlan = JSON.parse(String(consoleLog.mock.calls[0]?.[0])) as {
			blockers: Array<Record<string, unknown>>;
			formatVersion: number;
			releaseMigration: { actions: string[]; id: string };
			status: string;
		};
		expect(jsonPlan).toMatchObject({
			blockers: [],
			formatVersion: 1,
			releaseMigration: {
				actions: [
					"write the 1.7 account identity onto every existing account row",
				],
				id: "1.6-to-1.7",
			},
			status: "ready",
		});

		backfill1630CredentialAccountIdentity(db);
		const backfilledMigration = await getMigrations(auth17.options);
		expect(backfilledMigration.migrationBlockers).toContainEqual({
			code: "required-column-constraint",
			columns: ["issuer"],
			table: "account",
		});
		await expect(backfilledMigration.runMigrations()).rejects.toThrow(
			'Migration blocked: existing table "account" must make "issuer" non-nullable.',
		);
		await expect(backfilledMigration.compileMigrations()).rejects.toThrow(
			'Migration blocked: existing table "account" must make "issuer" non-nullable.',
		);

		enforce1630CredentialAccountIdentityConstraints(db);
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

	it("migrates account identities the configuration can resolve on its own", async () => {
		const db = new Database(":memory:");
		const auth1630 = betterAuth1630({
			baseURL: "http://localhost:3000",
			database: db,
			emailAndPassword: {
				enabled: true,
			},
		});
		await (await getMigrations1630(auth1630.options)).runMigrations();
		await auth1630.api.signUpEmail({
			body: {
				email: "ada@example.com",
				name: "Ada",
				password: "correct-horse-battery-staple",
			},
		});
		const auth17 = betterAuth({
			account: { identityStrategy: "provider-id" },
			baseURL: "http://localhost:3000",
			database: db,
			emailAndPassword: {
				enabled: true,
			},
		});
		vi.spyOn(config, "getConfig").mockImplementation(
			async () => auth17.options,
		);
		vi.spyOn(process, "exit").mockImplementation((code) => code as never);
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

		await migrateAction({
			approved: true,
			cwd: process.cwd(),
			mode: "apply",
		});

		expect(consoleError).not.toHaveBeenCalledWith(
			"Migration blocked. No database changes were applied.",
		);
		expect(consoleLog).toHaveBeenCalledWith(
			"🚀 migration was completed successfully!",
		);
		const migratedAccount = db
			.prepare("SELECT accountId, issuer, userId FROM account")
			.get() as {
			accountId: string;
			issuer: string;
			userId: string;
		};
		expect(migratedAccount.issuer).toBe("local:credential");
		expect(migratedAccount.accountId).toBe(migratedAccount.userId);
		const signIn = await auth17.api.signInEmail({
			body: {
				email: "ada@example.com",
				password: "correct-horse-battery-staple",
			},
		});
		expect(signIn.user.name).toBe("Ada");

		consoleLog.mockClear();
		await migrateAction({
			approved: true,
			cwd: process.cwd(),
			mode: "apply",
		});

		expect(consoleLog).toHaveBeenCalledWith("🚀 No migrations needed.");
	});
});

async function createReleaseDecisionFixture(
	db: Database.Database,
	{
		identityStrategy = "provider-id",
		sourceClientSecretStorage = "plain",
		targetClientSecretStorage = "hashed",
	}: {
		identityStrategy?: "issuer" | "provider-id" | "unset";
		sourceClientSecretStorage?: "encrypted" | "hashed" | "plain";
		targetClientSecretStorage?: "encrypted" | "hashed";
	} = {},
) {
	const auth1630 = betterAuth1630({
		baseURL: "http://localhost:3000",
		database: db,
		emailAndPassword: {
			enabled: true,
		},
		plugins: [
			oidcProvider1630({
				allowDynamicClientRegistration: true,
				loginPage: "/login",
				storeClientSecret: sourceClientSecretStorage,
			}),
			scim1630(),
		],
	});
	await (await getMigrations1630(auth1630.options)).runMigrations();
	const credentials = {
		email: "release-admin@example.com",
		name: "Release Admin",
		password: "correct-horse-battery-staple",
	};
	const admin = await auth1630.api.signUpEmail({ body: credentials });
	const signIn = await auth1630.api.signInEmail({
		body: {
			email: credentials.email,
			password: credentials.password,
		},
		returnHeaders: true,
	});
	const cookie = signIn.headers.getSetCookie()[0];
	if (!cookie) {
		throw new Error("Expected the 1.6.30 sign-in to set a session cookie");
	}
	const generated = await auth1630.api.generateSCIMToken({
		body: { providerId: "workforce-fixture" },
		headers: { cookie },
	});
	await auth1630.api.createSCIMUser({
		body: {
			name: { formatted: "Ada Provisioned" },
			userName: "ada-provisioned@example.com",
		},
		headers: {
			authorization: `Bearer ${generated.scimToken}`,
		},
	});
	const sourceContext = await auth1630.$context;
	const scimAccount = await sourceContext.adapter.findOne<{ id: string }>({
		model: "account",
		where: [{ field: "providerId", value: "workforce-fixture" }],
	});
	if (!scimAccount) {
		throw new Error("Expected the 1.6.30 SCIM authentication account");
	}
	const registeredClient = await auth1630.api.registerOAuthApplication({
		body: {
			client_name: "Release decision fixture",
			redirect_uris: ["https://client.example/callback"],
		},
	});
	const now = new Date();
	await sourceContext.adapter.create({
		model: "oauthConsent",
		data: {
			clientId: registeredClient.client_id,
			consentGiven: true,
			createdAt: now,
			scopes: "openid profile",
			updatedAt: now,
			userId: admin.user.id,
		},
	});

	const options17: BetterAuthOptions = {
		...(identityStrategy !== "unset" && { account: { identityStrategy } }),
		baseURL: "http://localhost:3000",
		database: db,
		emailAndPassword: {
			enabled: true,
		},
		plugins: [
			jwt(),
			oauthProvider({
				consentPage: "/consent",
				disableJwtPlugin: targetClientSecretStorage === "encrypted",
				loginPage: "/login",
				silenceWarnings: {
					oauthAuthServerConfig: true,
					openidConfig: true,
				},
				storeClientSecret: targetClientSecretStorage,
			}),
			scim({
				connections: [
					{
						credentials: [
							{
								id: "fixture-token",
								token: "fixture-token",
								type: "bearer",
							},
						],
						id: "workforce-fixture",
					},
				],
			}),
		],
	};
	vi.spyOn(config, "getConfig").mockImplementation(async () => options17);
	return {
		credentials,
		options17,
		registeredClientId: registeredClient.client_id,
		scimAccountId: scimAccount.id,
	};
}

async function writeMigrationDecisions(decisions: unknown) {
	const directory = await fs.mkdtemp(
		path.join(os.tmpdir(), "better-auth-migration-decisions-"),
	);
	const filePath = path.join(directory, "better-auth-migration.json");
	await fs.writeFile(filePath, JSON.stringify(decisions, null, 2));
	return filePath;
}

function readTableNames(db: Database.Database) {
	return db
		.prepare(
			"SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
		)
		.all()
		.map((table) => (table as { name: string }).name);
}

describe("migrate command modes", () => {
	beforeEach(() => {
		vi.spyOn(process, "exit").mockImplementation((code) => code as never);
	});

	it("applies a migration in JSON mode and prints one structured result", async () => {
		const db = new Database(":memory:");
		const auth = betterAuth({ database: db });
		vi.spyOn(config, "getConfig").mockImplementation(async () => auth.options);
		const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

		await createMigrateCommand().parseAsync([
			"node",
			"auth",
			"apply",
			"--json",
			"--yes",
		]);

		expect(consoleLog).toHaveBeenCalledTimes(1);
		expect(JSON.parse(String(consoleLog.mock.calls[0]?.[0]))).toMatchObject({
			formatVersion: 1,
			mode: "apply",
			plan: {
				status: "ready",
				target: { adapter: "kysely", dialect: "sqlite" },
			},
			status: "applied",
		});
		expect(readTableNames(db)).toEqual([
			"account",
			"session",
			"user",
			"verification",
		]);
	});

	it("returns a blocked JSON result without changing release data", async () => {
		const db = new Database(":memory:");
		await createReleaseDecisionFixture(db);
		const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

		await migrateAction({
			approved: true,
			cwd: process.cwd(),
			mode: "apply",
			outputFormat: "json",
		});

		expect(process.exit).toHaveBeenCalledWith(1);
		expect(consoleLog).toHaveBeenCalledTimes(1);
		expect(JSON.parse(String(consoleLog.mock.calls[0]?.[0]))).toMatchObject({
			formatVersion: 1,
			mode: "apply",
			plan: { status: "blocked" },
			status: "blocked",
		});
		expect(
			db
				.prepare(
					"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'oauthClient'",
				)
				.get(),
		).toBeUndefined();
	});

	it("stops the CLI spinner when a release migration fails", async () => {
		const db = new Database(":memory:");
		const { scimAccountId } = await createReleaseDecisionFixture(db);
		const migrationFile = await writeMigrationDecisions({
			formatVersion: 1,
			migration: "1.6-to-1.7",
			oauth: {
				clientSecrets: { source: "plain", target: "hashed" },
				consents: "migrate",
			},
			scim: { retireAccountIds: [scimAccountId] },
		});
		vi.spyOn(releaseMigration, "migrateFrom16").mockRejectedValueOnce(
			new Error("forced apply failure"),
		);
		await expect(
			migrateAction({
				approved: true,
				cwd: process.cwd(),
				migrationFile,
				mode: "apply",
			}),
		).rejects.toThrow("forced apply failure");

		const spinner = vi.mocked(yoctoSpinner).mock.results.at(-1)?.value;
		expect(spinner?.stop).toHaveBeenCalled();
	});

	it("stops the CLI spinner when migration inspection fails", async () => {
		const db = new Database(":memory:");
		const auth = betterAuth({ database: db });
		vi.spyOn(config, "getConfig").mockImplementation(async () => auth.options);
		vi.spyOn(releaseMigration, "getMigrations").mockRejectedValueOnce(
			new Error("forced inspection failure"),
		);

		await expect(
			migrateAction({ cwd: process.cwd(), mode: "plan" }),
		).rejects.toThrow("forced inspection failure");

		const spinner = vi.mocked(yoctoSpinner).mock.results.at(-1)?.value;
		expect(spinner?.stop).toHaveBeenCalled();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10575#discussion_r3830648963
	 */
	it.each([
		"plan",
		"apply",
	] as const)("reports release inspection failures as a blocked JSON %s result", async (mode) => {
		const db = new Database(":memory:");
		const auth = betterAuth({ database: db });
		vi.spyOn(config, "getConfig").mockImplementation(async () => auth.options);
		const inspectLegacyReleaseData = vi
			.spyOn(releaseMigration, "inspectLegacyReleaseDataFrom16")
			.mockRejectedValueOnce(new Error("legacy data is unreadable"));
		const migrationFile = await writeMigrationDecisions({
			formatVersion: 1,
			migration: "1.6-to-1.7",
		});
		const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

		try {
			await expect(
				migrateAction({
					approved: true,
					cwd: process.cwd(),
					migrationFile,
					mode,
					outputFormat: "json",
				}),
			).resolves.toBeUndefined();

			expect(inspectLegacyReleaseData).toHaveBeenCalledOnce();
			if (mode === "plan") {
				expect(process.exitCode).toBe(1);
			} else {
				expect(process.exit).toHaveBeenCalledWith(1);
			}
			const output = JSON.parse(String(consoleLog.mock.calls[0]?.[0]));
			const plan = mode === "apply" ? output.plan : output;
			expect(plan).toMatchObject({
				blockers: [
					{
						code: "release-migration-error",
						message: "legacy data is unreadable",
					},
				],
				status: "blocked",
			});
			if (mode === "apply") {
				expect(output).toMatchObject({ status: "blocked" });
			}
		} finally {
			process.exitCode = undefined;
		}
	});

	it("rejects interactive JSON application before inspecting the database", async () => {
		const getConfig = vi.spyOn(config, "getConfig");
		const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

		await createMigrateCommand().parseAsync([
			"node",
			"auth",
			"apply",
			"--json",
		]);

		expect(getConfig).not.toHaveBeenCalled();
		expect(process.exit).toHaveBeenCalledWith(1);
		expect(consoleLog).toHaveBeenCalledTimes(1);
		expect(JSON.parse(String(consoleLog.mock.calls[0]?.[0]))).toEqual({
			formatVersion: 1,
			mode: "apply",
			remediation: "Pass --yes to confirm a non-interactive JSON application.",
			status: "approval-required",
		});
	});

	it("keeps approval outside the read-only plan command", async () => {
		const command = createMigrateCommand();
		const planCommand = command.commands.find(
			(childCommand) => childCommand.name() === "plan",
		);
		planCommand?.exitOverride().configureOutput({ writeErr: () => {} });

		await expect(
			command.parseAsync(["node", "auth", "plan", "--yes"]),
		).rejects.toMatchObject({
			code: "commander.unknownOption",
		});
	});

	it.each([
		"plan",
		"apply",
	] as const)("passes the positional migration file to migrate %s", async (mode) => {
		const migrationFile = await writeMigrationDecisions({
			formatVersion: 2,
			migration: "1.6-to-1.7",
		});
		const getConfig = vi.spyOn(config, "getConfig");
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});

		await createMigrateCommand().parseAsync([
			"node",
			"auth",
			mode,
			migrationFile,
			...(mode === "apply" ? ["--yes"] : []),
		]);

		expect(getConfig).not.toHaveBeenCalled();
		expect(consoleError).toHaveBeenCalledWith(
			expect.stringContaining(
				`The migration decisions file "${migrationFile}" is invalid`,
			),
		);
	});

	it("prefers explicit subcommand paths over parent command paths", async () => {
		const parentDirectory = await fs.mkdtemp(
			path.join(os.tmpdir(), "better-auth-parent-migration-"),
		);
		const childDirectory = await fs.mkdtemp(
			path.join(os.tmpdir(), "better-auth-child-migration-"),
		);
		const getConfig = vi.spyOn(config, "getConfig").mockResolvedValue(null);
		vi.spyOn(console, "error").mockImplementation(() => {});

		await createMigrateCommand().parseAsync([
			"node",
			"auth",
			"--cwd",
			parentDirectory,
			"--config",
			"parent-auth.ts",
			"plan",
			"--cwd",
			childDirectory,
			"--config",
			"child-auth.ts",
		]);

		expect(getConfig).toHaveBeenCalledWith({
			configPath: "child-auth.ts",
			cwd: childDirectory,
		});
	});

	it("keeps the released plain migrate command as an apply alias", async () => {
		const db = new Database(":memory:");
		const auth = betterAuth({ database: db });
		vi.spyOn(config, "getConfig").mockImplementation(async () => auth.options);
		const consoleWarn = vi.spyOn(console, "warn").mockImplementation(() => {});
		vi.spyOn(console, "log").mockImplementation(() => {});

		await createMigrateCommand().parseAsync(["node", "auth", "--yes"]);

		expect(consoleWarn).toHaveBeenCalledWith(
			"WARNING: `auth migrate` without an action is deprecated. Use `auth migrate apply`.",
		);
		expect(readTableNames(db)).toEqual([
			"account",
			"session",
			"user",
			"verification",
		]);
	});

	it.each([
		"--dry-run",
		"--plan",
	])("rejects the unpublished %s option", async (option) => {
		const command = createMigrateCommand();
		command.exitOverride().configureOutput({ writeErr: () => {} });

		await expect(
			command.parseAsync([
				"node",
				"auth",
				option,
				...(option === "--plan" ? ["better-auth-migration.json"] : []),
			]),
		).rejects.toMatchObject({
			code: "commander.unknownOption",
		});
	});
});

describe("plan every unresolved 1.6.30 release decision", () => {
	it("reports the provider-id issuer backfill and an unknown SCIM inventory accurately", async () => {
		const db = new Database(":memory:");
		await createReleaseDecisionFixture(db, {
			identityStrategy: "provider-id",
		});
		const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

		try {
			await migrateAction({
				cwd: process.cwd(),
				mode: "plan",
				outputFormat: "json",
			});

			const jsonPlan = JSON.parse(String(consoleLog.mock.calls[0]?.[0])) as {
				releaseMigration?: { actions: string[] };
			};
			expect(jsonPlan.releaseMigration?.actions).toContain(
				"write the 1.7 account identity onto every existing account row",
			);
			expect(jsonPlan.releaseMigration?.actions).toContain(
				"retire 1 SCIM provider, confirm the complete provisioned-account retirement inventory, and require a full reprovision of every SCIM connection",
			);
			expect(jsonPlan.releaseMigration?.actions).not.toContain(
				"retire 1 SCIM provider, delete 0 provisioned accounts, and require a full reprovision of every SCIM connection",
			);
		} finally {
			process.exitCode = undefined;
		}
	});

	it("reports the consent strategy and SCIM inventory in one run", async () => {
		const db = new Database(":memory:");
		const { scimAccountId } = await createReleaseDecisionFixture(db, {
			identityStrategy: "unset",
		});
		const plan = await writeMigrationDecisions({
			formatVersion: 1,
			migration: "1.6-to-1.7",
			scim: { retireAccountIds: [] },
		});
		const processExit = vi
			.spyOn(process, "exit")
			.mockImplementation((code) => code as never);
		const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

		try {
			await migrateAction({
				cwd: process.cwd(),
				migrationFile: plan,
				mode: "plan",
				outputFormat: "json",
			});

			expect(processExit).not.toHaveBeenCalled();
			expect(process.exitCode).toBe(1);
			const jsonPlan = JSON.parse(String(consoleLog.mock.calls[0]?.[0])) as {
				blockers: Array<Record<string, unknown>>;
				releaseMigration?: { actions: string[] };
				status: string;
			};
			expect(jsonPlan.status).toBe("blocked");
			expect(jsonPlan.releaseMigration?.actions).toContain(
				"write the 1.7 account identity onto every existing account row",
			);
			expect(jsonPlan.blockers).toEqual([
				{
					accountCount: 2,
					code: "account-identity-strategy-required",
					providerIds: ["credential", "workforce-fixture"],
					remediation: {
						docs: "https://better-auth.com/docs/guides/1-7-upgrade-guide#choose-account-identity-strategy",
						summary:
							'Set account: { identityStrategy: "provider-id" } to preserve 1.6 account identity, then run the plan again.',
					},
					table: "account",
				},
				{
					code: "scim-inventory-mismatch",
					missingAccountIds: [scimAccountId],
					remediation: {
						docs: "https://better-auth.com/docs/guides/1-7-upgrade-guide#scim-requires-full-reprovisioning",
						summary:
							"Set scim.retireAccountIds in better-auth-migration.json to exactly the accounts this blocker reports.",
					},
					table: "account",
					unknownAccountIds: [],
				},
				{
					code: "oauth-client-decision-required",
					remediation: {
						docs: "https://better-auth.com/docs/guides/1-7-upgrade-guide#migrate-from-16-to-17",
						summary:
							'Record how the 1.6 client secrets are stored under oauth.clientSecrets in better-auth-migration.json; the configured 1.7 target is "hashed".',
					},
					rowCount: 1,
					table: "oauthApplication",
					target: "hashed",
				},
				{
					code: "oauth-consent-decision-required",
					remediation: {
						docs: "https://better-auth.com/docs/guides/1-7-upgrade-guide#migrate-from-16-to-17",
						summary:
							'Record oauth.consents as "migrate" or "reauthorize" in better-auth-migration.json, or run `auth migrate apply` in a terminal to answer it there.',
					},
					rowCount: 1,
					table: "oauthConsent",
				},
			]);
		} finally {
			process.exitCode = undefined;
		}
	});

	it("refuses to guess the decisions when none are recorded", async () => {
		const db = new Database(":memory:");
		await createReleaseDecisionFixture(db);
		const processExit = vi
			.spyOn(process, "exit")
			.mockImplementation((code) => code as never);
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		vi.spyOn(console, "log").mockImplementation(() => {});

		await migrateAction({
			approved: true,
			cwd: process.cwd(),
			mode: "apply",
		});

		expect(processExit).toHaveBeenCalledWith(1);
		expect(consoleError).toHaveBeenCalledWith(
			"Migration blocked. No database changes were applied.",
		);
		expect(consoleError).toHaveBeenCalledWith(
			'-> [scim-decision-required] The 1.6 SCIM migration requires providers: "reprovision" and an explicit accountIdsToRetire inventory.',
		);
		expect(consoleError).toHaveBeenCalledWith(
			"   Fix: Record scim.retireAccountIds in better-auth-migration.json, or run `auth migrate apply` in a terminal to confirm the retirement inventory there.",
		);
		expect(consoleError).toHaveBeenCalledWith(
			"   Docs: https://better-auth.com/docs/guides/1-7-upgrade-guide#scim-requires-full-reprovisioning",
		);
		expect(consoleError).toHaveBeenCalledWith(
			"This database holds Better Auth 1.6 data. Run `auth migrate apply` in a terminal to answer these decisions, or record them in better-auth-migration.json and run `auth migrate apply better-auth-migration.json`. Upgrade guide: https://better-auth.com/docs/guides/1-7-upgrade-guide",
		);
		expect(
			db
				.prepare(
					"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'oauthClient'",
				)
				.get(),
		).toBeUndefined();
	});

	it("applies the recorded decisions", async () => {
		const db = new Database(":memory:");
		const { credentials, scimAccountId } =
			await createReleaseDecisionFixture(db);
		const plan = await writeMigrationDecisions({
			formatVersion: 1,
			migration: "1.6-to-1.7",
			oauth: {
				clientSecrets: { source: "plain", target: "hashed" },
				consents: "reauthorize",
			},
			scim: { retireAccountIds: [scimAccountId] },
		});
		vi.spyOn(process, "exit").mockImplementation((code) => code as never);
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

		await migrateAction({
			approved: true,
			cwd: process.cwd(),
			migrationFile: plan,
			mode: "apply",
		});

		expect(consoleError).not.toHaveBeenCalledWith(
			"Migration blocked. No database changes were applied.",
		);
		expect(consoleLog).toHaveBeenCalledWith(
			"🚀 migration was completed successfully!",
		);
		expect(
			db.prepare("SELECT COUNT(*) AS count FROM oauthClient").get(),
		).toEqual({ count: 1 });
		expect(
			db.prepare("SELECT COUNT(*) AS count FROM oauthConsent").get(),
		).toEqual({ count: 0 });
		expect(
			db
				.prepare("SELECT COUNT(*) AS count FROM account WHERE id = ?")
				.get(scimAccountId),
		).toEqual({ count: 0 });
		expect(
			db
				.prepare(
					`SELECT name FROM sqlite_master
					 WHERE type = 'table' AND name LIKE '%__better_auth_1_6'
					 ORDER BY name`,
				)
				.all()
				.map((table) => (table as { name: string }).name),
		).toEqual([
			"oauthAccessToken__better_auth_1_6",
			"oauthApplication__better_auth_1_6",
			"oauthConsent__better_auth_1_6",
			"scimProvider__better_auth_1_6",
		]);
		const auth17 = betterAuth({
			baseURL: "http://localhost:3000",
			database: db,
			emailAndPassword: { enabled: true },
		});
		const signIn = await auth17.api.signInEmail({
			body: {
				email: credentials.email,
				password: credentials.password,
			},
		});
		expect(signIn.user.name).toBe(credentials.name);
	});

	it("preserves default SHA-256 client secrets instead of hashing them twice", async () => {
		const db = new Database(":memory:");
		const { registeredClientId, scimAccountId } =
			await createReleaseDecisionFixture(db, {
				sourceClientSecretStorage: "hashed",
			});
		const sourceClient = db
			.prepare("SELECT clientSecret FROM oauthApplication WHERE clientId = ?")
			.get(registeredClientId) as { clientSecret: string };
		const plan = await writeMigrationDecisions({
			formatVersion: 1,
			migration: "1.6-to-1.7",
			oauth: {
				clientSecrets: { source: "hashed", target: "hashed" },
				consents: "reauthorize",
			},
			scim: { retireAccountIds: [scimAccountId] },
		});
		vi.spyOn(process, "exit").mockImplementation((code) => code as never);
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(console, "log").mockImplementation(() => {});

		await migrateAction({
			approved: true,
			cwd: process.cwd(),
			migrationFile: plan,
			mode: "apply",
		});

		expect(
			db
				.prepare("SELECT clientSecret FROM oauthClient WHERE clientId = ?")
				.get(registeredClientId),
		).toEqual(sourceClient);
	});

	it("preserves encrypted client secrets when both versions use encryption", async () => {
		const db = new Database(":memory:");
		const { registeredClientId, scimAccountId } =
			await createReleaseDecisionFixture(db, {
				sourceClientSecretStorage: "encrypted",
				targetClientSecretStorage: "encrypted",
			});
		const sourceClient = db
			.prepare("SELECT clientSecret FROM oauthApplication WHERE clientId = ?")
			.get(registeredClientId) as { clientSecret: string };
		const plan = await writeMigrationDecisions({
			formatVersion: 1,
			migration: "1.6-to-1.7",
			oauth: {
				clientSecrets: { source: "encrypted", target: "encrypted" },
				consents: "reauthorize",
			},
			scim: { retireAccountIds: [scimAccountId] },
		});
		vi.spyOn(process, "exit").mockImplementation((code) => code as never);
		vi.spyOn(console, "error").mockImplementation(() => {});
		vi.spyOn(console, "log").mockImplementation(() => {});

		await migrateAction({
			approved: true,
			cwd: process.cwd(),
			migrationFile: plan,
			mode: "apply",
		});

		expect(
			db
				.prepare("SELECT clientSecret FROM oauthClient WHERE clientId = ?")
				.get(registeredClientId),
		).toEqual(sourceClient);
	});

	it("rejects a decisions file it does not understand", async () => {
		const db = new Database(":memory:");
		await createReleaseDecisionFixture(db);
		const plan = await writeMigrationDecisions({
			formatVersion: 2,
			migration: "1.6-to-1.7",
			retireScim: true,
		});
		const processExit = vi
			.spyOn(process, "exit")
			.mockImplementation((code) => code as never);
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});

		await migrateAction({
			approved: true,
			cwd: process.cwd(),
			migrationFile: plan,
			mode: "apply",
		});

		expect(processExit).toHaveBeenCalledWith(1);
		const message = String(consoleError.mock.calls[0]?.[0]);
		expect(message).toContain(
			`The migration decisions file "${plan}" is invalid`,
		);
		expect(message).toContain("formatVersion");
		expect(message).toContain("retireScim");
	});
});

async function createResolvableAccountFixture(db: Database.Database) {
	const auth1630 = betterAuth1630({
		baseURL: "http://localhost:3000",
		database: db,
		emailAndPassword: {
			enabled: true,
		},
	});
	await (await getMigrations1630(auth1630.options)).runMigrations();
	const credentials = {
		email: "ada@example.com",
		name: "Ada",
		password: "correct-horse-battery-staple",
	};
	await auth1630.api.signUpEmail({ body: credentials });
	const options17: BetterAuthOptions = {
		account: { identityStrategy: "provider-id" },
		baseURL: "http://localhost:3000",
		database: db,
		emailAndPassword: {
			enabled: true,
		},
	};
	vi.spyOn(config, "getConfig").mockImplementation(async () => options17);
	return { credentials };
}

function stubStdinIsTTY(isTTY: boolean) {
	const original = Object.getOwnPropertyDescriptor(process.stdin, "isTTY");
	Object.defineProperty(process.stdin, "isTTY", {
		configurable: true,
		value: isTTY,
	});
	return () => {
		if (original) {
			Object.defineProperty(process.stdin, "isTTY", original);
			return;
		}
		Reflect.deleteProperty(process.stdin, "isTTY");
	};
}

async function createInterviewDirectory() {
	return await fs.mkdtemp(
		path.join(os.tmpdir(), "better-auth-migration-interview-"),
	);
}

async function readRecordedDecisions(cwd: string) {
	return JSON.parse(
		await fs.readFile(path.join(cwd, "better-auth-migration.json"), "utf8"),
	);
}

describe("interview the unresolved 1.6.30 release decisions", () => {
	it("records every answer and applies the migration", async () => {
		const db = new Database(":memory:");
		const { scimAccountId } = await createReleaseDecisionFixture(db);
		const cwd = await createInterviewDirectory();
		const restoreStdin = stubStdinIsTTY(true);
		vi.spyOn(process, "exit").mockImplementation((code) => code as never);
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
		vi.mocked(prompts)
			.mockResolvedValueOnce({ source: "plain" })
			.mockResolvedValueOnce({ consents: "reauthorize" })
			.mockResolvedValueOnce({ retire: true })
			.mockResolvedValueOnce({ migrate: true });

		try {
			await migrateAction({ cwd, mode: "apply" });
		} finally {
			restoreStdin();
		}

		expect(prompts).toHaveBeenCalledTimes(4);
		expect(prompts).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				message:
					'How did Better Auth 1.6 store OAuth client secrets? The configured 1.7 target is "hashed".',
				name: "source",
				type: "select",
			}),
		);
		expect(prompts).toHaveBeenNthCalledWith(
			2,
			expect.objectContaining({
				message: "Stored OAuth consents",
				name: "consents",
				type: "select",
			}),
		);
		expect(prompts).toHaveBeenNthCalledWith(
			3,
			expect.objectContaining({
				message: "Retire these SCIM accounts?",
				name: "retire",
				type: "confirm",
			}),
		);
		expect(prompts).toHaveBeenNthCalledWith(
			4,
			expect.objectContaining({
				message: "Are you sure you want to run these migrations?",
				name: "migrate",
				type: "confirm",
			}),
		);
		expect(consoleLog).toHaveBeenCalledWith("->", scimAccountId);
		expect(consoleLog).toHaveBeenCalledWith(
			"->",
			"drop 1 stored consent so users grant them again",
		);
		expect(await readRecordedDecisions(cwd)).toEqual({
			formatVersion: 1,
			migration: "1.6-to-1.7",
			oauth: {
				clientSecrets: { source: "plain", target: "hashed" },
				consents: "reauthorize",
			},
			scim: { retireAccountIds: [scimAccountId] },
		});
		expect(consoleError).not.toHaveBeenCalledWith(
			"Migration blocked. No database changes were applied.",
		);
		expect(consoleLog).toHaveBeenCalledWith(
			"🚀 migration was completed successfully!",
		);
		expect(
			db.prepare("SELECT COUNT(*) AS count FROM oauthClient").get(),
		).toEqual({ count: 1 });
		expect(
			db
				.prepare("SELECT COUNT(*) AS count FROM account WHERE id = ?")
				.get(scimAccountId),
		).toEqual({ count: 0 });
	});

	it("keeps the recorded answers when the final confirmation is declined", async () => {
		const db = new Database(":memory:");
		const { scimAccountId } = await createReleaseDecisionFixture(db);
		const cwd = await createInterviewDirectory();
		const restoreStdin = stubStdinIsTTY(true);
		vi.spyOn(process, "exit").mockImplementation((code) => code as never);
		const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
		vi.mocked(prompts)
			.mockResolvedValueOnce({ source: "plain" })
			.mockResolvedValueOnce({ consents: "migrate" })
			.mockResolvedValueOnce({ retire: true })
			.mockResolvedValueOnce({ migrate: false });

		try {
			await migrateAction({ cwd, mode: "apply" });
		} finally {
			restoreStdin();
		}

		expect(consoleLog).toHaveBeenCalledWith("Migration cancelled.");
		expect(consoleLog).toHaveBeenCalledWith(
			"Apply the recorded decisions later with `auth migrate apply better-auth-migration.json`.",
		);
		expect(await readRecordedDecisions(cwd)).toEqual({
			formatVersion: 1,
			migration: "1.6-to-1.7",
			oauth: {
				clientSecrets: { source: "plain", target: "hashed" },
				consents: "migrate",
			},
			scim: { retireAccountIds: [scimAccountId] },
		});
		expect(
			db
				.prepare(
					"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'oauthClient'",
				)
				.get(),
		).toBeUndefined();
		expect(
			db
				.prepare("SELECT COUNT(*) AS count FROM account WHERE id = ?")
				.get(scimAccountId),
		).toEqual({ count: 1 });
	});

	it("preserves a different existing decisions file and exits cleanly", async () => {
		const db = new Database(":memory:");
		await createReleaseDecisionFixture(db);
		const cwd = await createInterviewDirectory();
		const existingDecisions = {
			formatVersion: 1,
			migration: "1.6-to-1.7",
		};
		await fs.writeFile(
			path.join(cwd, "better-auth-migration.json"),
			`${JSON.stringify(existingDecisions, null, 2)}\n`,
			"utf8",
		);
		const restoreStdin = stubStdinIsTTY(true);
		const processExit = vi
			.spyOn(process, "exit")
			.mockImplementation((code) => code as never);
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		vi.spyOn(console, "log").mockImplementation(() => {});
		vi.mocked(prompts)
			.mockResolvedValueOnce({ source: "plain" })
			.mockResolvedValueOnce({ consents: "reauthorize" })
			.mockResolvedValueOnce({ retire: true });

		try {
			await migrateAction({ cwd, mode: "apply" });
		} finally {
			restoreStdin();
		}

		expect(processExit).toHaveBeenCalledWith(1);
		expect(consoleError).toHaveBeenCalledWith(
			expect.stringContaining(
				"already exists with different decisions and was not changed",
			),
		);
		expect(await readRecordedDecisions(cwd)).toEqual(existingDecisions);
		expect(prompts).toHaveBeenCalledTimes(3);
	});

	it("records nothing when a question is cancelled", async () => {
		const db = new Database(":memory:");
		await createReleaseDecisionFixture(db);
		const cwd = await createInterviewDirectory();
		const restoreStdin = stubStdinIsTTY(true);
		vi.spyOn(process, "exit").mockImplementation((code) => code as never);
		const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
		vi.mocked(prompts).mockResolvedValueOnce({});

		try {
			await migrateAction({ cwd, mode: "apply" });
		} finally {
			restoreStdin();
		}

		expect(prompts).toHaveBeenCalledTimes(1);
		expect(consoleLog).toHaveBeenCalledWith("Migration cancelled.");
		expect(await fs.readdir(cwd)).toEqual([]);
		expect(
			db
				.prepare(
					"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'oauthClient'",
				)
				.get(),
		).toBeUndefined();
	});

	it("asks nothing but the final confirmation when the configuration resolves every decision", async () => {
		const db = new Database(":memory:");
		const { credentials } = await createResolvableAccountFixture(db);
		const cwd = await createInterviewDirectory();
		const restoreStdin = stubStdinIsTTY(true);
		vi.spyOn(process, "exit").mockImplementation((code) => code as never);
		const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
		vi.mocked(prompts).mockResolvedValueOnce({ migrate: true });

		try {
			await migrateAction({ cwd, mode: "apply" });
		} finally {
			restoreStdin();
		}

		expect(prompts).toHaveBeenCalledTimes(1);
		expect(prompts).toHaveBeenCalledWith(
			expect.objectContaining({
				message: "Are you sure you want to run these migrations?",
				name: "migrate",
				type: "confirm",
			}),
		);
		expect(consoleLog).toHaveBeenCalledWith(
			"->",
			"write the 1.7 account identity onto every existing account row",
		);
		expect(await fs.readdir(cwd)).toEqual([]);
		expect(consoleLog).toHaveBeenCalledWith(
			"🚀 migration was completed successfully!",
		);
		expect(db.prepare("SELECT issuer FROM account").get()).toEqual({
			issuer: "local:credential",
		});
		const auth17 = betterAuth({
			account: { identityStrategy: "provider-id" },
			baseURL: "http://localhost:3000",
			database: db,
			emailAndPassword: { enabled: true },
		});
		const signIn = await auth17.api.signInEmail({
			body: {
				email: credentials.email,
				password: credentials.password,
			},
		});
		expect(signIn.user.name).toBe(credentials.name);
	});

	it("asks nothing outside a terminal", async () => {
		const db = new Database(":memory:");
		await createReleaseDecisionFixture(db);
		const cwd = await createInterviewDirectory();
		const restoreStdin = stubStdinIsTTY(false);
		const processExit = vi
			.spyOn(process, "exit")
			.mockImplementation((code) => code as never);
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		vi.spyOn(console, "log").mockImplementation(() => {});

		try {
			await migrateAction({ cwd, mode: "apply" });
		} finally {
			restoreStdin();
		}

		expect(prompts).not.toHaveBeenCalled();
		expect(processExit).toHaveBeenCalledWith(1);
		expect(consoleError).toHaveBeenCalledWith(
			"Migration blocked. No database changes were applied.",
		);
		expect(await fs.readdir(cwd)).toEqual([]);
		expect(
			db
				.prepare(
					"SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'oauthClient'",
				)
				.get(),
		).toBeUndefined();
	});
});

describe("migrate published 1.6.30 provider client data", () => {
	it("blocks before leaving registered clients in the retired table", async () => {
		const db = new Database(":memory:");
		const auth1630 = betterAuth1630({
			baseURL: "http://localhost:3000",
			database: db,
			emailAndPassword: {
				enabled: true,
			},
			plugins: [
				oidcProvider1630({
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
		await (await getMigrations1630(auth1630.options)).runMigrations();
		const registeredClient = await auth1630.api.registerOAuthApplication({
			body: {
				client_name: "Migration fixture",
				redirect_uris: ["https://client.example/callback"],
			},
		});
		expect(registeredClient.client_id).toBeTypeOf("string");
		expect(
			db.prepare("SELECT COUNT(*) AS count FROM legacyOAuthApplication").get(),
		).toEqual({ count: 1 });
		const sourceUser = await auth1630.api.signUpEmail({
			body: {
				email: "provider-owner@example.com",
				name: "Provider Owner",
				password: "correct-horse-battery-staple",
			},
		});
		const sourceContext = await auth1630.$context;
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
		await expect(validateMigrationFrom16(auth17.options, {})).resolves.toEqual(
			[],
		);
	});
});

async function createRenamedLegacyClientFixture(db: Database.Database) {
	const auth1630 = betterAuth1630({
		baseURL: "http://localhost:3000",
		database: db,
		emailAndPassword: {
			enabled: true,
		},
		plugins: [
			oidcProvider1630({
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
	await (await getMigrations1630(auth1630.options)).runMigrations();
	const credentials = {
		email: "renamed-table-admin@example.com",
		name: "Renamed Table Admin",
		password: "correct-horse-battery-staple",
	};
	await auth1630.api.signUpEmail({ body: credentials });
	await auth1630.api.registerOAuthApplication({
		body: {
			client_name: "Renamed table fixture",
			redirect_uris: ["https://client.example/callback"],
		},
	});
	const options17: BetterAuthOptions = {
		account: { identityStrategy: "provider-id" },
		baseURL: "http://localhost:3000",
		database: db,
		emailAndPassword: {
			enabled: true,
		},
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
	};
	vi.spyOn(config, "getConfig").mockImplementation(async () => options17);
	return { credentials };
}

function readBackupTableNames(db: Database.Database) {
	return db
		.prepare(
			`SELECT name FROM sqlite_master
			 WHERE type = 'table' AND name LIKE '%__better_auth_1_6'
			 ORDER BY name`,
		)
		.all()
		.map((table) => (table as { name: string }).name);
}

describe("migrate a customized 1.6.30 table name", () => {
	it("proposes the renamed table instead of leaving its clients behind", async () => {
		const db = new Database(":memory:");
		await createRenamedLegacyClientFixture(db);
		const processExit = vi
			.spyOn(process, "exit")
			.mockImplementation((code) => code as never);
		const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

		try {
			await migrateAction({
				cwd: process.cwd(),
				mode: "plan",
				outputFormat: "json",
			});

			expect(processExit).not.toHaveBeenCalled();
			expect(process.exitCode).toBe(1);
			const jsonPlan = JSON.parse(String(consoleLog.mock.calls[0]?.[0])) as {
				blockers: Array<Record<string, unknown>>;
			};
			expect(jsonPlan.blockers).toEqual([
				{
					candidateTables: ["legacyOAuthApplication"],
					code: "legacy-table-candidate",
					model: "oauthApplication",
					remediation: {
						docs: "https://better-auth.com/docs/guides/1-7-upgrade-guide#migrate-from-16-to-17",
						summary:
							'Record which table holds the 1.6 "oauthApplication" data under legacyTableNames in better-auth-migration.json, or null when none of them does, or run `auth migrate apply` in a terminal to answer it there.',
					},
					table: "oauthApplication",
				},
			]);
		} finally {
			process.exitCode = undefined;
		}
	});

	it("migrates the renamed table recorded in the decisions file", async () => {
		const db = new Database(":memory:");
		await createRenamedLegacyClientFixture(db);
		const plan = await writeMigrationDecisions({
			formatVersion: 1,
			migration: "1.6-to-1.7",
			legacyTableNames: { oauthApplication: "legacyOAuthApplication" },
			oauth: {
				clientSecrets: { source: "plain", target: "hashed" },
				consents: "reauthorize",
			},
		});
		vi.spyOn(process, "exit").mockImplementation((code) => code as never);
		const consoleError = vi
			.spyOn(console, "error")
			.mockImplementation(() => {});
		const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});

		await migrateAction({
			approved: true,
			cwd: process.cwd(),
			migrationFile: plan,
			mode: "apply",
		});

		expect(consoleError).not.toHaveBeenCalledWith(
			"Migration blocked. No database changes were applied.",
		);
		expect(consoleLog).toHaveBeenCalledWith(
			"🚀 migration was completed successfully!",
		);
		expect(
			db.prepare("SELECT COUNT(*) AS count FROM oauthClient").get(),
		).toEqual({ count: 1 });
		expect(readBackupTableNames(db)).toContain(
			"legacyOAuthApplication__better_auth_1_6",
		);
	});

	it("migrates the renamed table confirmed in the interview", async () => {
		const db = new Database(":memory:");
		await createRenamedLegacyClientFixture(db);
		const cwd = await createInterviewDirectory();
		const restoreStdin = stubStdinIsTTY(true);
		vi.spyOn(process, "exit").mockImplementation((code) => code as never);
		const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
		vi.mocked(prompts)
			.mockResolvedValueOnce({ isLegacyTable: true })
			.mockResolvedValueOnce({ source: "plain" })
			.mockResolvedValueOnce({ migrate: true });

		try {
			await migrateAction({ cwd, mode: "apply" });
		} finally {
			restoreStdin();
		}

		expect(prompts).toHaveBeenNthCalledWith(
			1,
			expect.objectContaining({
				message:
					'Does "legacyOAuthApplication" hold your 1.6 oauthApplication data?',
				name: "isLegacyTable",
				type: "confirm",
			}),
		);
		expect(await readRecordedDecisions(cwd)).toEqual({
			formatVersion: 1,
			migration: "1.6-to-1.7",
			legacyTableNames: { oauthApplication: "legacyOAuthApplication" },
			oauth: {
				clientSecrets: { source: "plain", target: "hashed" },
				consents: "reauthorize",
			},
		});
		expect(consoleLog).toHaveBeenCalledWith(
			"->",
			"move 1 OAuth client into oauthClient and hash the stored plaintext client secrets for the 1.7 provider",
		);
		expect(consoleLog).toHaveBeenCalledWith(
			"🚀 migration was completed successfully!",
		);
		expect(
			db.prepare("SELECT COUNT(*) AS count FROM oauthClient").get(),
		).toEqual({ count: 1 });
		expect(readBackupTableNames(db)).toContain(
			"legacyOAuthApplication__better_auth_1_6",
		);
	});

	it("leaves a table the interview rejects untouched", async () => {
		const db = new Database(":memory:");
		await createRenamedLegacyClientFixture(db);
		const cwd = await createInterviewDirectory();
		const restoreStdin = stubStdinIsTTY(true);
		vi.spyOn(process, "exit").mockImplementation((code) => code as never);
		const consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
		vi.mocked(prompts)
			.mockResolvedValueOnce({ isLegacyTable: false })
			.mockResolvedValueOnce({ migrate: true });

		try {
			await migrateAction({ cwd, mode: "apply" });
		} finally {
			restoreStdin();
		}

		expect(prompts).toHaveBeenCalledTimes(2);
		expect(await readRecordedDecisions(cwd)).toEqual({
			formatVersion: 1,
			migration: "1.6-to-1.7",
			legacyTableNames: { oauthApplication: null },
		});
		expect(consoleLog).toHaveBeenCalledWith(
			"🚀 migration was completed successfully!",
		);
		expect(
			db.prepare("SELECT COUNT(*) AS count FROM legacyOAuthApplication").get(),
		).toEqual({ count: 1 });
		expect(readBackupTableNames(db)).not.toContain(
			"legacyOAuthApplication__better_auth_1_6",
		);
		expect(
			db.prepare("SELECT COUNT(*) AS count FROM oauthClient").get(),
		).toEqual({ count: 0 });
	});
});

describe("migrate published 1.6.30 SCIM data", () => {
	it("requires a reviewed reprovision before creating the replacement models", async () => {
		const db = new Database(":memory:");
		const auth1630 = betterAuth1630({
			baseURL: "http://localhost:3000",
			database: db,
			emailAndPassword: {
				enabled: true,
			},
			plugins: [scim1630()],
		});
		await (await getMigrations1630(auth1630.options)).runMigrations();
		const credentials = {
			email: "scim-admin@example.com",
			name: "SCIM Admin",
			password: "correct-horse-battery-staple",
		};
		await auth1630.api.signUpEmail({ body: credentials });
		const signIn = await auth1630.api.signInEmail({
			body: {
				email: credentials.email,
				password: credentials.password,
			},
			returnHeaders: true,
		});
		const cookie = signIn.headers.getSetCookie()[0];
		if (!cookie) {
			throw new Error("Expected the 1.6.30 sign-in to set a session cookie");
		}
		const generated = await auth1630.api.generateSCIMToken({
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

describe("migrate published 1.6.30 organization team data", () => {
	it("keeps legacy memberships and repairs the team counter on the first write", async () => {
		const db = new Database(":memory:");
		const auth1630 = betterAuth1630({
			baseURL: "http://localhost:3000",
			database: db,
			emailAndPassword: {
				enabled: true,
			},
			plugins: [
				organization1630({
					teams: {
						enabled: true,
					},
				}),
			],
		});
		await (await getMigrations1630(auth1630.options)).runMigrations();
		const owner = await auth1630.api.signUpEmail({
			body: {
				email: "team-owner@example.com",
				name: "Team Owner",
				password: "correct-horse-battery-staple",
			},
		});
		const teammate = await auth1630.api.signUpEmail({
			body: {
				email: "team-member@example.com",
				name: "Team Member",
				password: "correct-horse-battery-staple",
			},
		});
		const sourceOrganization = await auth1630.api.createOrganization({
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

		backfill1630CredentialAccountIdentity(db);
		enforce1630CredentialAccountIdentityConstraints(db);
		const organizationOptions = {
			teams: {
				enabled: true as const,
				maximumMembersPerTeam: 2,
			},
		};
		const auth17 = betterAuth({
			account: { identityStrategy: "provider-id" },
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
