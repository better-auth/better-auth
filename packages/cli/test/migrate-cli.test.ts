import { execFile } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { promisify } from "node:util";
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

// A populated SQLite database whose account table predates the required
// `plan` additional field, so the guardrail must refuse to add it.
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
	account: { additionalFields: { plan: { type: "string", required: true } } },
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
	return { cwd };
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

describe("auth migrate: refusing a destructive column add", () => {
	it("exits 1 with a clean refusal and no stack trace", async () => {
		const { cwd } = createProject();
		const { exitCode, output } = await runCli(
			["migrate", "--config", "auth.ts", "--yes"],
			cwd,
		);

		expect(exitCode).toBe(1);
		expect(output).toContain(
			'Cannot add required column "plan" to populated table "account"',
		);
		expect(output).not.toContain("triggerUncaughtException");
		expect(output).not.toContain("node:internal");
		expect(output).not.toMatch(/at .*:\d+:\d+/);
	});
});

describe("auth generate: emitting the refused migration with a warning", () => {
	it("exits 0 and writes the warning banner alongside the computed statements", async () => {
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
			'alter table "account" add column "plan" text not null',
		);
	});
});
