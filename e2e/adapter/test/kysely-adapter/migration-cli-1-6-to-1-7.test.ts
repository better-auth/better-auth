import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { Pool } from "pg";
import { expect, it } from "vitest";
import {
	PUBLISHED_FIXTURE_PASSWORD,
	seedPublishedOAuthProviderData,
} from "./published-1-6-25-fixture";

/**
 * Drives the built CLI binary, so the lane needs a current build:
 * `pnpm --filter @better-auth/core --filter better-auth --filter auth build`.
 */
const cliEntry = path.resolve(
	import.meta.dirname,
	"../../../../packages/cli/dist/index.mjs",
);

const postgresAdminUrl = "postgres://user:password@localhost:5433/postgres";

interface MigrateCliResult {
	exitCode: number | null;
	stderr: string;
	stdout: string;
}

function createDatabaseName() {
	const databaseName = `better_auth_migrate_cli_${process.pid}_${Date.now()}`;
	if (!/^[a-z0-9_]+$/.test(databaseName)) {
		throw new Error(`Unsafe migration test database name: ${databaseName}`);
	}
	return databaseName;
}

function runMigrateCli(cwd: string, args: string[]): Promise<MigrateCliResult> {
	return new Promise((resolve, reject) => {
		const child = spawn(process.execPath, [cliEntry, "migrate", ...args], {
			cwd,
			env: { ...process.env, NO_COLOR: "1" },
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
		child.on("error", reject);
		child.on("close", (exitCode) => resolve({ exitCode, stderr, stdout }));
	});
}

async function writeAuthProject(directory: string, connectionString: string) {
	await writeFile(
		path.join(directory, "auth.ts"),
		`import { oauthProvider } from "@better-auth/oauth-provider";
import { betterAuth } from "better-auth";
import { jwt } from "better-auth/plugins";
import { Pool } from "pg";

export const auth = betterAuth({
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

it("guides a populated 1.6.25 PostgreSQL database through the CLI decisions file", {
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

		const planRun = await runMigrateCli(projectDirectory, ["--json"]);

		expect(planRun.exitCode, planRun.stderr).toBe(1);
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
			"--plan",
			"better-auth-migration.json",
			"--yes",
		]);

		expect(applyRun.exitCode, `${applyRun.stdout}\n${applyRun.stderr}`).toBe(0);
		expect(applyRun.stdout).toContain("migration was completed successfully!");

		const auth17 = betterAuth({
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
