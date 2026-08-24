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
		return { exitCode: 0, output: `${stdout}${stderr}` };
	} catch (error) {
		const failure = error as {
			code?: number;
			stdout?: string;
			stderr?: string;
		};
		return {
			exitCode: failure.code ?? 1,
			output: `${failure.stdout ?? ""}${failure.stderr ?? ""}`,
		};
	}
}

const projects: string[] = [];

// A pre-1.7 SQLite database whose populated account table must remain
// provider-scoped when the 1.7 strategy is omitted.
function createProject() {
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

describe("auth migrate: preserving the default account identity", () => {
	it("plans a populated 1.6 account table without adding issuer", async () => {
		const { cwd, databasePath } = createProject();
		const { exitCode, output } = await runCli(
			["migrate", "plan", "--config", "auth.ts", "--json"],
			cwd,
		);

		expect(exitCode).toBe(0);
		expect(JSON.parse(output)).toMatchObject({
			accountIdentity: {
				selectedStrategy: "provider-id",
				detectedStrategy: "provider-id",
			},
			blockers: [],
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
	it("keeps the published account schema and sign-in behavior unchanged", async () => {
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
		expect(JSON.parse(planned.output)).toMatchObject({
			accountIdentity: {
				selectedStrategy: "provider-id",
				detectedStrategy: "provider-id",
			},
			blockers: [],
			status: "up-to-date",
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
		expect(JSON.parse(applied.output)).toMatchObject({
			mode: "apply",
			plan: {
				status: "up-to-date",
			},
			status: "up-to-date",
		});

		const migratedDatabase = new Database(databasePath);
		expect(
			migratedDatabase
				.prepare("PRAGMA table_info(account)")
				.all()
				.map((column) => (column as { name: string }).name),
		).not.toContain("issuer");
		const auth17 = betterAuth({
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

describe("auth generate: preserving the default account identity", () => {
	it("emits no issuer column or destructive warning", async () => {
		const { cwd } = createProject();
		const { exitCode, output } = await runCli(
			["generate", "--config", "auth.ts", "--output", "migration.sql", "--yes"],
			cwd,
		);

		expect(exitCode).toBe(0);
		expect(output).not.toContain("corrupts a populated database");

		const sql = fs.readFileSync(path.join(cwd, "migration.sql"), "utf-8");
		expect(sql).not.toContain("DO NOT RUN THIS SCRIPT AS IT IS.");
		expect(sql.toLowerCase()).not.toContain('column "issuer"');
	});
});
