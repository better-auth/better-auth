import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import {
	copyFile,
	mkdir,
	mkdtemp,
	readFile,
	rm,
	writeFile,
} from "node:fs/promises";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { OAuth2Server } from "oauth2-mock-server";
import { Pool } from "pg";
import { expect, it } from "vitest";
import {
	PUBLISHED_FIXTURE_PASSWORD,
	seedPublishedOAuthProviderData,
} from "./published-1-6-30-fixture";

/**
 * Drives the built CLI binary, so the lane needs a current build:
 * `pnpm --filter @better-auth/core --filter better-auth --filter auth build`.
 */
const cliEntry = path.resolve(
	import.meta.dirname,
	"../../../../packages/cli/dist/index.mjs",
);

const postgresAdminUrl = "postgres://user:password@localhost:5433/postgres";
const subprocessTimeoutMs = 120_000;

interface MigrateCliResult {
	exitCode: number | null;
	stderr: string;
	stdout: string;
}

function redactCommandOutput(output: string) {
	return output.replace(/^([A-Z][A-Z0-9_]*_RESULT)=.*$/gm, "$1=[redacted]");
}

function formatCommandOutput(result: MigrateCliResult) {
	return redactCommandOutput(`${result.stdout}\n${result.stderr}`);
}

function createDatabaseName() {
	const databaseName = `better_auth_migrate_cli_${process.pid}_${Date.now()}`;
	if (!/^[a-z0-9_]+$/.test(databaseName)) {
		throw new Error(`Unsafe migration test database name: ${databaseName}`);
	}
	return databaseName;
}

function runNode(
	cwd: string,
	args: string[],
	environment: NodeJS.ProcessEnv = {},
	timeoutMs = subprocessTimeoutMs,
): Promise<MigrateCliResult> {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, args, {
			cwd,
			env: { ...process.env, ...environment, NO_COLOR: "1" },
			stdio: ["ignore", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		child.stdout.setEncoding("utf8");
		child.stderr.setEncoding("utf8");
		child.stdout.on("data", (chunk: string) => {
			stdout += chunk;
		});
		child.stderr.on("data", (chunk: string) => {
			stderr += chunk;
		});
		let settled = false;
		const settle = (callback: () => void) => {
			if (settled) return;
			settled = true;
			clearTimeout(timeout);
			callback();
		};
		const timeout = setTimeout(() => {
			child.kill();
			settle(() =>
				reject(
					new Error(
						`Subprocess timed out after ${timeoutMs}ms:\n${formatCommandOutput({ exitCode: null, stderr, stdout })}`,
					),
				),
			);
		}, timeoutMs);
		child.on("error", (error) => settle(() => reject(error)));
		child.on("close", (exitCode) =>
			settle(() => resolve({ exitCode, stderr, stdout })),
		);
	});
}

function runMigrateCli(
	cwd: string,
	args: string[],
	environment?: NodeJS.ProcessEnv,
): Promise<MigrateCliResult> {
	return runNode(cwd, [cliEntry, "migrate", ...args], environment);
}

function readSentinelResult<Result>(stdout: string, sentinel: string): Result {
	const line = stdout
		.split("\n")
		.find((candidate) => candidate.startsWith(`${sentinel}=`));
	if (!line) {
		throw new Error(
			`Missing ${sentinel} in subprocess output:\n${redactCommandOutput(stdout)}`,
		);
	}
	return JSON.parse(line.slice(sentinel.length + 1)) as Result;
}

it("bounds subprocesses", async () => {
	const failure = await runNode(
		import.meta.dirname,
		["-e", "setInterval(() => {}, 1_000)"],
		{},
		50,
	).catch((error: unknown) => error);

	expect(failure).toBeInstanceOf(Error);
	expect((failure as Error).message).toContain(
		"Subprocess timed out after 50ms",
	);
});

it("redacts sentinel output from failures", () => {
	const output = 'PUBLISHED_FIXTURE_RESULT={"clientSecret":"secret-value"}';

	expect(redactCommandOutput(output)).toBe(
		"PUBLISHED_FIXTURE_RESULT=[redacted]",
	);
	expect(redactCommandOutput(output)).not.toContain("secret-value");
	expect(() => readSentinelResult(output, "MISSING_RESULT")).toThrow(
		"PUBLISHED_FIXTURE_RESULT=[redacted]",
	);
});

async function startIdentityProvider(subject: string) {
	const identityProvider = new OAuth2Server();
	await identityProvider.issuer.keys.generate("RS256");
	identityProvider.service.on("beforeUserinfo", (response) => {
		response.body = {
			email: "directory-user@migration.example.com",
			email_verified: true,
			name: "Published Directory User",
			sub: subject,
		};
		response.statusCode = 200;
	});
	identityProvider.service.on("beforeTokenSigning", (token) => {
		token.payload.email = "directory-user@migration.example.com";
		token.payload.email_verified = true;
		token.payload.name = "Published Directory User";
		token.payload.sub = subject;
	});
	await identityProvider.start(0, "127.0.0.1");
	return identityProvider;
}

function readSqliteSchema(databasePath: string) {
	const database = new DatabaseSync(databasePath);
	try {
		return database
			.prepare(
				`SELECT type, name, tbl_name AS tableName, sql
				 FROM sqlite_master
				 WHERE name NOT LIKE 'sqlite_%'
				 ORDER BY type, name`,
			)
			.all();
	} finally {
		database.close();
	}
}

async function writeAuthProject(directory: string, connectionString: string) {
	await writeFile(
		path.join(directory, "auth.ts"),
		`import { oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { Pool } from "pg";

export const auth = betterAuth({
	account: { identityStrategy: "provider-id" },
	baseURL: "http://localhost:3000",
	database: new Pool({ connectionString: ${JSON.stringify(connectionString)} }),
	emailAndPassword: { enabled: true },
	plugins: [
		jwt(),
		oauthProvider({
			consentPage: "/consent",
			loginPage: "/login",
			silenceWarnings: { oauthAuthServerConfig: true, openidConfig: true },
		}),
	],
});
`,
		"utf8",
	);
}

it("guides a populated 1.6.30 PostgreSQL database through the CLI decisions file", {
	timeout: 180_000,
}, async () => {
	if (!existsSync(cliEntry)) {
		throw new Error(
			`The CLI is not built. Run \`pnpm --filter @better-auth/core --filter better-auth --filter auth build\` before this lane (missing ${cliEntry}).`,
		);
	}

	const databaseName = createDatabaseName();
	const connectionString = `postgres://user:password@localhost:5433/${databaseName}`;
	let adminPool: Pool | null = null;
	let databaseCreated = false;
	let pool: Pool | null = null;
	let projectDirectory: string | null = null;

	try {
		adminPool = new Pool({ connectionString: postgresAdminUrl });
		await adminPool.query(`CREATE DATABASE "${databaseName}"`);
		databaseCreated = true;
		pool = new Pool({ connectionString });
		// The spawned CLI resolves `better-auth` and `pg` from the project directory
		// upwards, so it has to sit inside this workspace rather than the OS temp dir.
		const temporaryRoot = path.join(import.meta.dirname, ".tmp");
		await mkdir(temporaryRoot, { recursive: true });
		projectDirectory = await mkdtemp(path.join(temporaryRoot, "migrate-cli-"));

		const { owner, registeredClient } = await seedPublishedOAuthProviderData({
			database: pool,
			emailDomain: "migrate-cli.example.com",
			nameSuffix: "CLI",
		});
		await writeAuthProject(projectDirectory, connectionString);

		const planRun = await runMigrateCli(projectDirectory, ["plan", "--json"]);

		expect(planRun.exitCode, formatCommandOutput(planRun)).toBe(1);
		const plan = JSON.parse(planRun.stdout) as {
			blockers: Array<{
				code: string;
				remediation: { docs: string; summary: string };
			}>;
			status: string;
			target: { adapter: string; dialect: string };
		};
		expect(plan.status).toBe("blocked");
		expect(plan.target.dialect).toBe("postgres");
		expect(plan.blockers.map((blocker) => blocker.code)).toEqual([
			"oauth-token-decision-required",
			"oauth-client-decision-required",
			"oauth-consent-decision-required",
		]);
		for (const blocker of plan.blockers) {
			expect(blocker.remediation.docs).toBe(
				"https://better-auth.com/docs/guides/1-7-upgrade-guide#migrate-from-16-to-17",
			);
			expect(blocker.remediation.summary).toContain(
				"better-auth-migration.json",
			);
		}

		await writeFile(
			path.join(projectDirectory, "better-auth-migration.json"),
			`${JSON.stringify(
				{
					formatVersion: 1,
					migration: "1.6-to-1.7",
					oauth: {
						clientSecrets: { source: "plain", target: "hashed" },
						consents: "migrate",
					},
				},
				null,
				2,
			)}\n`,
			"utf8",
		);

		const applyRun = await runMigrateCli(projectDirectory, [
			"apply",
			"better-auth-migration.json",
			"--yes",
		]);

		expect(applyRun.exitCode, formatCommandOutput(applyRun)).toBe(0);
		expect(applyRun.stdout).toContain("migration was completed successfully!");

		const auth17 = betterAuth({
			account: { identityStrategy: "provider-id" },
			baseURL: "http://localhost:3000",
			database: pool,
			emailAndPassword: { enabled: true },
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
		const signIn = await auth17.api.signInEmail({
			body: {
				email: `provider-owner@migrate-cli.example.com`,
				password: PUBLISHED_FIXTURE_PASSWORD,
			},
		});
		expect(signIn.user.name).toBe("CLI Provider Owner");

		const currentContext = await auth17.$context;
		expect(
			await currentContext.adapter.findOne<{ redirectUris: string[] }>({
				model: "oauthClient",
				where: [{ field: "clientId", value: registeredClient.client_id }],
			}),
		).toMatchObject({
			redirectUris: ["https://migrate-cli.example.com/callback"],
		});
		expect(
			await currentContext.adapter.findOne<{ scopes: string[] }>({
				model: "oauthConsent",
				where: [
					{ field: "clientId", value: registeredClient.client_id },
					{ field: "userId", value: owner.user.id },
				],
			}),
		).toMatchObject({ scopes: ["openid", "profile"] });

		const backupTables = await pool.query<{ table_name: string }>(
			`SELECT table_name FROM information_schema.tables
			 WHERE table_schema = 'public' AND table_name LIKE '%__better_auth_1_6'
			 ORDER BY table_name`,
		);
		expect(backupTables.rows.map((row) => row.table_name)).toEqual([
			"oauthAccessToken__better_auth_1_6",
			"oauthApplication__better_auth_1_6",
			"oauthConsent__better_auth_1_6",
		]);
	} finally {
		if (projectDirectory) {
			await rm(projectDirectory, { force: true, recursive: true });
		}
		if (pool) await pool.end();
		if (adminPool) {
			if (databaseCreated) {
				await adminPool.query(`DROP DATABASE "${databaseName}"`);
			}
			await adminPool.end();
		}
	}
});

it("migrates populated published 1.6 OAuth, SCIM, and SSO workflows through the guided 1.7 path", {
	timeout: 180_000,
}, async () => {
	const fixtureDirectory = import.meta.dirname;
	const published16Directory = path.join(fixtureDirectory, "published-1-6-app");
	const published17Directory = path.join(fixtureDirectory, "published-1-7-app");
	const published16Seed = path.join(published16Directory, "seed.mjs");
	const published17Cli = path.join(
		published17Directory,
		"node_modules/auth/dist/index.mjs",
	);
	const guidedConfig = path.join(fixtureDirectory, "guided-auth.mjs");
	const guidedVerifier = path.join(
		fixtureDirectory,
		"verify-guided-migration.mjs",
	);
	for (const requiredFile of [
		cliEntry,
		published16Seed,
		published17Cli,
		guidedConfig,
		guidedVerifier,
	]) {
		expect(
			existsSync(requiredFile),
			`Missing migration fixture ${requiredFile}`,
		).toBe(true);
	}
	expect(
		JSON.parse(
			await readFile(
				path.join(
					published16Directory,
					"node_modules/better-auth/package.json",
				),
				"utf8",
			),
		).version,
	).toBe("1.6.30");
	expect(
		JSON.parse(
			await readFile(
				path.join(
					published17Directory,
					"node_modules/better-auth/package.json",
				),
				"utf8",
			),
		).version,
	).toBe("1.7.0");

	const temporaryRoot = path.join(fixtureDirectory, ".tmp");
	await mkdir(temporaryRoot, { recursive: true });
	const testDirectory = await mkdtemp(
		path.join(temporaryRoot, "published-full-stack-"),
	);
	const sourceDatabase = path.join(testDirectory, "source-1.6.sqlite");
	const published17Database = path.join(testDirectory, "ordinary-1.7.sqlite");
	const guidedDatabase = path.join(testDirectory, "guided-1.7.sqlite");
	const decisionsFile = path.join(testDirectory, "better-auth-migration.json");

	try {
		const seedRun = await runNode(published16Directory, [
			published16Seed,
			sourceDatabase,
		]);
		expect(seedRun.exitCode, formatCommandOutput(seedRun)).toBe(0);
		const source = readSentinelResult<{
			accounts: Array<{
				accountId: string;
				id: string;
				providerId: string;
				userId: string;
			}>;
			administratorUserId: string;
			clientId: string;
			clientSecret: string;
			directorySubject: string;
			scimAccountId: string;
			tableCounts: Record<string, number>;
		}>(seedRun.stdout, "PUBLISHED_FIXTURE_RESULT");
		expect(source.tableCounts).toMatchObject({
			account: 3,
			oauthAccessToken: 1,
			oauthApplication: 1,
			oauthConsent: 1,
			scimProvider: 1,
			user: 3,
		});
		expect(source.accounts.map(({ providerId }) => providerId)).toEqual([
			"credential",
			"workforce-scim",
			"workforce-sso",
		]);

		await copyFile(sourceDatabase, published17Database);
		await copyFile(sourceDatabase, guidedDatabase);
		const ordinarySchemaBefore = readSqliteSchema(published17Database);
		const ordinaryMigration = await runNode(
			published17Directory,
			[published17Cli, "migrate", "--config", "auth.mjs", "--yes"],
			{
				BETTER_AUTH_MIGRATION_DATABASE: published17Database,
			},
		);
		expect(ordinaryMigration.exitCode).toBe(1);
		expect(formatCommandOutput(ordinaryMigration)).toContain(
			"Cannot add a NOT NULL column with default value NULL",
		);
		expect(readSqliteSchema(published17Database)).toEqual(ordinarySchemaBefore);

		const migrationEnvironment = {
			BETTER_AUTH_MIGRATION_DATABASE: guidedDatabase,
		};
		const guidedSchemaBefore = readSqliteSchema(guidedDatabase);
		const blockedPlanRun = await runMigrateCli(
			fixtureDirectory,
			["plan", "--config", guidedConfig, "--json"],
			migrationEnvironment,
		);
		expect(blockedPlanRun.exitCode, formatCommandOutput(blockedPlanRun)).toBe(
			1,
		);
		const blockedPlan = JSON.parse(blockedPlanRun.stdout) as {
			blockers: Array<{ code: string }>;
			releaseMigration: { actions: string[] };
			status: string;
		};
		expect(blockedPlan.status).toBe("blocked");
		expect(blockedPlan.blockers.map(({ code }) => code)).toEqual([
			"oauth-token-decision-required",
			"oauth-client-decision-required",
			"oauth-consent-decision-required",
			"scim-decision-required",
		]);
		expect(blockedPlan.releaseMigration.actions).toContain(
			"write the 1.7 account identity onto every existing account row",
		);
		expect(blockedPlan.releaseMigration.actions).toContain(
			"retire 1 SCIM provider, confirm the complete provisioned-account retirement inventory, and require a full reprovision of every SCIM connection",
		);
		expect(readSqliteSchema(guidedDatabase)).toEqual(guidedSchemaBefore);

		await writeFile(
			decisionsFile,
			`${JSON.stringify(
				{
					formatVersion: 1,
					migration: "1.6-to-1.7",
					oauth: {
						clientSecrets: { source: "plain", target: "hashed" },
						consents: "migrate",
					},
					scim: { retireAccountIds: [source.scimAccountId] },
				},
				null,
				2,
			)}\n`,
			"utf8",
		);
		const readyPlanRun = await runMigrateCli(
			fixtureDirectory,
			["plan", decisionsFile, "--config", guidedConfig, "--json"],
			migrationEnvironment,
		);
		expect(readyPlanRun.exitCode, formatCommandOutput(readyPlanRun)).toBe(0);
		const readyPlan = JSON.parse(readyPlanRun.stdout) as {
			accountIdentity: {
				migrationRequired: boolean;
				selectedStrategy: string;
			};
			blockers: unknown[];
			changes: { addIndexes: Array<{ columns: string[] }> };
			status: string;
		};
		expect(readyPlan).toMatchObject({
			accountIdentity: {
				migrationRequired: true,
				selectedStrategy: "provider-id",
			},
			blockers: [],
			status: "ready",
		});
		expect(readyPlan.changes.addIndexes).toContainEqual(
			expect.objectContaining({ columns: ["issuer", "accountId"] }),
		);

		const applyRun = await runMigrateCli(
			fixtureDirectory,
			["apply", decisionsFile, "--config", guidedConfig, "--yes", "--json"],
			migrationEnvironment,
		);
		expect(applyRun.exitCode, formatCommandOutput(applyRun)).toBe(0);
		expect(JSON.parse(applyRun.stdout)).toMatchObject({ status: "applied" });
		const repeatedPlanRun = await runMigrateCli(
			fixtureDirectory,
			["plan", decisionsFile, "--config", guidedConfig, "--json"],
			migrationEnvironment,
		);
		expect(repeatedPlanRun.exitCode, formatCommandOutput(repeatedPlanRun)).toBe(
			0,
		);
		expect(JSON.parse(repeatedPlanRun.stdout)).toMatchObject({
			blockers: [],
			changes: { addColumns: [], addIndexes: [], createTables: [] },
			status: "up-to-date",
		});
		expect(JSON.parse(repeatedPlanRun.stdout)).not.toHaveProperty(
			"releaseMigration",
		);

		const migratedDatabase = new DatabaseSync(guidedDatabase);
		try {
			const issuerColumn = migratedDatabase
				.prepare(`PRAGMA table_info("account")`)
				.all()
				.find((column) => column.name === "issuer");
			expect(issuerColumn).toMatchObject({ notnull: 1 });
			expect(
				migratedDatabase
					.prepare(`PRAGMA index_info("account_issuer_accountId_uidx")`)
					.all()
					.map((column) => column.name),
			).toEqual(["issuer", "accountId"]);
			expect(
				migratedDatabase
					.prepare(
						`SELECT issuer, accountId, providerId, userId
							 FROM account ORDER BY providerId`,
					)
					.all(),
			).toEqual([
				expect.objectContaining({
					issuer: "local:credential",
					providerId: "credential",
				}),
				expect.objectContaining({
					accountId: source.directorySubject,
					issuer: "local:oauth:workforce-sso",
					providerId: "workforce-sso",
				}),
			]);
		} finally {
			migratedDatabase.close();
		}

		const provisionedSourceAccount = source.accounts.find(
			({ providerId }) => providerId === "workforce-scim",
		);
		if (!provisionedSourceAccount) {
			throw new Error("Published 1.6 did not create the SCIM account fixture");
		}
		const verificationRun = await runNode(
			fixtureDirectory,
			[guidedVerifier, guidedDatabase],
			{
				BETTER_AUTH_MIGRATION_CLIENT_ID: source.clientId,
				BETTER_AUTH_MIGRATION_CLIENT_SECRET: source.clientSecret,
				BETTER_AUTH_MIGRATION_SCIM_USER_ID: provisionedSourceAccount.userId,
			},
		);
		expect(verificationRun.exitCode, formatCommandOutput(verificationRun)).toBe(
			0,
		);
		const verified = readSentinelResult<{
			credentialUserId: string;
			oauthAccessToken: string;
			scimUserId: string;
			ssoUserId: string;
		}>(verificationRun.stdout, "GUIDED_MIGRATION_RESULT");
		expect(verified).toMatchObject({
			credentialUserId: source.administratorUserId,
			scimUserId: provisionedSourceAccount.userId,
			ssoUserId: source.accounts.find(
				({ providerId }) => providerId === "workforce-sso",
			)?.userId,
		});
		expect(verified.oauthAccessToken).not.toHaveLength(0);
	} finally {
		await rm(testDirectory, { force: true, recursive: true });
	}
});

it("keeps a populated published 1.7 issuer database unchanged when the strategy is omitted", {
	timeout: 180_000,
}, async () => {
	const fixtureDirectory = import.meta.dirname;
	const published17Directory = path.join(fixtureDirectory, "published-1-7-app");
	const published17Seed = path.join(published17Directory, "seed.mjs");
	const issuerConfig = path.join(fixtureDirectory, "issuer-auth.mjs");
	const issuerVerifier = path.join(fixtureDirectory, "verify-issuer-noop.mjs");
	for (const requiredFile of [
		cliEntry,
		published17Seed,
		issuerConfig,
		issuerVerifier,
	]) {
		expect(
			existsSync(requiredFile),
			`Missing migration fixture ${requiredFile}`,
		).toBe(true);
	}

	const temporaryRoot = path.join(fixtureDirectory, ".tmp");
	await mkdir(temporaryRoot, { recursive: true });
	const testDirectory = await mkdtemp(
		path.join(temporaryRoot, "published-issuer-noop-"),
	);
	const databasePath = path.join(testDirectory, "published-1.7.sqlite");
	const identityProvider = await startIdentityProvider(
		"published-1-7-directory-subject",
	);

	try {
		const issuer = identityProvider.issuer.url;
		if (!issuer)
			throw new Error("The published 1.7 identity provider has no URL");
		const seedRun = await runNode(published17Directory, [
			published17Seed,
			databasePath,
			issuer,
		]);
		expect(seedRun.exitCode, formatCommandOutput(seedRun)).toBe(0);
		const source = readSentinelResult<{
			accounts: Array<{
				accountId: string;
				issuer: string;
				providerId: string;
				userId: string;
			}>;
			administratorUserId: string;
			directorySubject: string;
		}>(seedRun.stdout, "PUBLISHED_1_7_FIXTURE_RESULT");
		expect(source.accounts).toEqual([
			expect.objectContaining({
				issuer: "local:credential",
				providerId: "credential",
				userId: source.administratorUserId,
			}),
			expect.objectContaining({
				accountId: source.directorySubject,
				issuer,
				providerId: "workforce-sso",
			}),
		]);

		const schemaBefore = readSqliteSchema(databasePath);
		const accountRowsBefore = source.accounts;
		const migrationEnvironment = {
			BETTER_AUTH_MIGRATION_DATABASE: databasePath,
			BETTER_AUTH_MIGRATION_IDP_ISSUER: issuer,
		};
		const planRun = await runMigrateCli(
			fixtureDirectory,
			["plan", "--config", issuerConfig, "--json"],
			migrationEnvironment,
		);
		expect(planRun.exitCode, formatCommandOutput(planRun)).toBe(0);
		const plan = JSON.parse(planRun.stdout) as {
			accountIdentity: {
				detectedStrategy: string;
				migrationRequired: boolean;
				selectedStrategy: string;
			};
			changes: {
				addColumns: Array<{ columns: string[]; table: string }>;
				addIndexes: Array<{ columns: string[]; table: string }>;
			};
			status: string;
		};
		expect(plan.accountIdentity).toMatchObject({
			detectedStrategy: "issuer",
			migrationRequired: false,
			selectedStrategy: "issuer",
		});
		expect(
			plan.changes.addColumns.filter(({ table }) => table === "account"),
		).toEqual([]);
		expect(
			plan.changes.addIndexes.filter(({ table }) => table === "account"),
		).toEqual([]);
		expect(readSqliteSchema(databasePath)).toEqual(schemaBefore);

		const applyRun = await runMigrateCli(
			fixtureDirectory,
			["apply", "--config", issuerConfig, "--yes", "--json"],
			migrationEnvironment,
		);
		expect(applyRun.exitCode, formatCommandOutput(applyRun)).toBe(0);
		expect(readSqliteSchema(databasePath)).toEqual(schemaBefore);

		const verifierRun = await runNode(fixtureDirectory, [
			issuerVerifier,
			databasePath,
			issuer,
		]);
		expect(verifierRun.exitCode, formatCommandOutput(verifierRun)).toBe(0);
		const verified = readSentinelResult<{
			accounts: typeof accountRowsBefore;
			credentialUserId: string;
		}>(verifierRun.stdout, "ISSUER_NOOP_RESULT");
		expect(verified.accounts).toEqual(accountRowsBefore);
		expect(verified.credentialUserId).toBe(source.administratorUserId);
	} finally {
		await identityProvider.stop();
		await rm(testDirectory, { force: true, recursive: true });
	}
});
