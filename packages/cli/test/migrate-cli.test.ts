import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
import { betterAuth } from "better-auth";
import { betterAuth as betterAuth1630 } from "better-auth-1-6-30";
import { getMigrations as getMigrations1630 } from "better-auth-1-6-30/db/migration";
import Database from "better-sqlite3";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cliPath } from "./utils";

const execFileAsync = promisify(execFile);

async function runCli(args: string[], cwd: string) {
	try {
		const { stdout, stderr } = await execFileAsync(
			process.execPath,
			[cliPath, ...args],
			{
				cwd,
				env: { ...process.env, BETTER_AUTH_TELEMETRY_DISABLED: "true" },
			},
		);
		return { exitCode: 0, output: `${stdout}${stderr}`, stderr, stdout };
	} catch (error) {
		const failure = error as {
			code?: number;
			stdout?: string;
			stderr?: string;
		};
		const stdout = failure.stdout ?? "";
		const stderr = failure.stderr ?? "";
		return {
			exitCode: failure.code ?? 1,
			output: `${stdout}${stderr}`,
			stderr,
			stdout,
		};
	}
}

const projects: string[] = [];

// A pre-1.7 SQLite database whose populated account table requires an explicit
// logical identity strategy before the 1.7 physical schema can be applied.
function createProject(identityStrategy?: "provider-id" | "issuer") {
	const cacheDir = path.join(
		process.cwd(),
		"node_modules",
		".cache",
		"migrate-cli-",
	);
	fs.mkdirSync(path.dirname(cacheDir), { recursive: true });
	const cwd = fs.mkdtempSync(cacheDir);
	projects.push(cwd);
	const databasePath = path.join(cwd, "app.db");
	fs.writeFileSync(
		path.join(cwd, "auth.ts"),
		`import { betterAuth } from "better-auth";
import Database from "better-sqlite3";

export const auth = betterAuth({
	${identityStrategy ? `account: { identityStrategy: ${JSON.stringify(identityStrategy)} },` : ""}
	database: new Database(${JSON.stringify(databasePath)}),
	secret: "a-secret-long-enough-to-keep-the-cli-quiet",
	baseURL: "http://localhost:3000",
	emailAndPassword: { enabled: true },
});
`,
	);

	const database = new Database(databasePath);
	database.exec(
		`CREATE TABLE "user" ("id" text primary key not null, "name" text not null, "email" text not null unique, "emailVerified" integer not null, "image" text, "createdAt" date not null, "updatedAt" date not null)`,
	);
	database.exec(
		`CREATE TABLE "account" (
			"id" text primary key not null,
			"accountId" text not null,
			"providerId" text not null,
			"userId" text not null references "user" ("id") on delete cascade,
			"createdAt" date not null,
			"updatedAt" date not null
		)`,
	);
	database.exec(
		`INSERT INTO "user" ("id", "name", "email", "emailVerified", "createdAt", "updatedAt") VALUES ('u1', 'Ada', 'ada@example.com', 1, '2020-01-01', '2020-01-01')`,
	);
	database.exec(
		`INSERT INTO "account" ("id", "accountId", "providerId", "userId", "createdAt", "updatedAt") VALUES ('a1', 'g-1', 'google', 'u1', '2020-01-01', '2020-01-01')`,
	);
	database.close();
	return { cwd, databasePath };
}

async function createPublished16Project() {
	const cacheDir = path.join(
		process.cwd(),
		"node_modules",
		".cache",
		"migrate-cli-1-6-",
	);
	fs.mkdirSync(path.dirname(cacheDir), { recursive: true });
	const cwd = fs.mkdtempSync(cacheDir);
	projects.push(cwd);
	const databasePath = path.join(cwd, "app.db");
	const credentials = {
		email: "ada@example.com",
		name: "Ada",
		password: "correct-horse-battery-staple",
	};
	const secret = "a-secret-long-enough-to-keep-the-cli-quiet";
	const baseURL = "http://localhost:3000";
	fs.writeFileSync(
		path.join(cwd, "auth.ts"),
		`import { betterAuth } from "better-auth";
import Database from "better-sqlite3";

export const auth = betterAuth({
	account: { identityStrategy: "provider-id" },
	database: new Database(${JSON.stringify(databasePath)}),
	secret: ${JSON.stringify(secret)},
	baseURL: ${JSON.stringify(baseURL)},
	emailAndPassword: { enabled: true },
});
`,
	);

	const database = new Database(databasePath);
	const auth1630 = betterAuth1630({
		baseURL,
		database,
		emailAndPassword: { enabled: true },
		secret,
	});
	await (await getMigrations1630(auth1630.options)).runMigrations();
	await auth1630.api.signUpEmail({ body: credentials });
	database.close();

	return { baseURL, credentials, cwd, databasePath, secret };
}

beforeAll(() => {
	if (!fs.existsSync(cliPath)) {
		throw new Error(
			`CLI binary not found at "${cliPath}". Run "pnpm --filter auth build" before running this test.`,
		);
	}
});

afterEach(() => {
	for (const cwd of projects.splice(0)) {
		fs.rmSync(cwd, { recursive: true, force: true });
	}
});

describe("auth migrate: requiring the 1.6 account identity decision", () => {
	it("blocks a populated 1.6 account table when the strategy is omitted", async () => {
		const { cwd, databasePath } = createProject();
		const { exitCode, output, stdout } = await runCli(
			["migrate", "plan", "--config", "auth.ts", "--json"],
			cwd,
		);

		expect(exitCode).toBe(1);
		expect(JSON.parse(stdout)).toMatchObject({
			accountIdentity: {
				detectedStrategy: "provider-id",
				selectedStrategy: "issuer",
			},
			blockers: [
				{
					accountCount: 1,
					code: "account-identity-strategy-required",
					providerIds: ["google"],
				},
			],
			status: "blocked",
		});
		const database = new Database(databasePath);
		expect(
			database
				.prepare("PRAGMA table_info(account)")
				.all()
				.map((column) => (column as { name: string }).name),
		).not.toContain("issuer");
		database.close();
		expect(output).not.toContain("triggerUncaughtException");
		expect(output).not.toContain("node:internal");
		expect(output).not.toMatch(/at .*:\d+:\d+/);
	});
});

describe("auth migrate: upgrading a published 1.6.30 database", () => {
	it("backfills provider namespaces and preserves sign-in behavior", async () => {
		const { baseURL, credentials, cwd, databasePath, secret } =
			await createPublished16Project();
		const sourceDatabase = new Database(databasePath);
		expect(
			sourceDatabase
				.prepare("PRAGMA table_info(account)")
				.all()
				.map((column) => (column as { name: string }).name),
		).not.toContain("issuer");
		sourceDatabase.close();

		const planned = await runCli(
			["migrate", "plan", "--config", "auth.ts", "--json"],
			cwd,
		);
		expect(planned.exitCode).toBe(0);
		expect(JSON.parse(planned.stdout)).toMatchObject({
			accountIdentity: {
				selectedStrategy: "provider-id",
				detectedStrategy: "provider-id",
			},
			blockers: [],
			changes: {
				addColumns: [
					expect.objectContaining({
						columns: expect.arrayContaining(["issuer"]),
					}),
				],
				addIndexes: [
					expect.objectContaining({ columns: ["issuer", "accountId"] }),
				],
			},
			status: "ready",
		});

		const plannedDatabase = new Database(databasePath);
		expect(
			plannedDatabase
				.prepare("PRAGMA table_info(account)")
				.all()
				.map((column) => (column as { name: string }).name),
		).not.toContain("issuer");
		plannedDatabase.close();

		const applied = await runCli(
			["migrate", "apply", "--config", "auth.ts", "--json", "--yes"],
			cwd,
		);
		expect(applied.exitCode).toBe(0);
		expect(JSON.parse(applied.stdout)).toMatchObject({
			mode: "apply",
			plan: {
				status: "ready",
			},
			status: "applied",
		});

		const migratedDatabase = new Database(databasePath);
		expect(
			migratedDatabase
				.prepare("PRAGMA table_info(account)")
				.all()
				.find((column) => (column as { name: string }).name === "issuer"),
		).toMatchObject({ name: "issuer", notnull: 1 });
		expect(
			migratedDatabase
				.prepare(
					`SELECT "issuer", "providerId" FROM "account" ORDER BY "providerId"`,
				)
				.all(),
		).toEqual([
			expect.objectContaining({
				issuer: "local:credential",
				providerId: "credential",
			}),
		]);
		const auth17 = betterAuth({
			account: { identityStrategy: "provider-id" },
			baseURL,
			database: migratedDatabase,
			emailAndPassword: { enabled: true },
			secret,
		});
		const signIn = await auth17.api.signInEmail({
			body: {
				email: credentials.email,
				password: credentials.password,
			},
		});
		expect(signIn.user.name).toBe(credentials.name);
		migratedDatabase.close();
	});
});

describe("auth generate: emitting the stable 1.7 account schema", () => {
	it("emits the required issuer column and populated-table warning", async () => {
		const { cwd } = createProject();
		const { exitCode, output } = await runCli(
			["generate", "--config", "auth.ts", "--output", "migration.sql", "--yes"],
			cwd,
		);

		expect(exitCode).toBe(0);
		expect(output).toContain("corrupts a populated database");

		const sql = fs.readFileSync(path.join(cwd, "migration.sql"), "utf-8");
		expect(sql).toContain("DO NOT RUN THIS SCRIPT AS IT IS.");
		expect(sql.toLowerCase()).toContain(
			'alter table "account" add column "issuer" text not null',
		);
	});
});
