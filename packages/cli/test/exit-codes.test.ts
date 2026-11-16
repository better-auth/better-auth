import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import Database from "better-sqlite3";
import {
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
	onTestFinished,
	vi,
} from "vitest";
import { cliPath } from "./utils";

const projects: string[] = [];

function createProject(files: Record<string, string> = {}) {
	const cacheDir = path.join(
		process.cwd(),
		"node_modules",
		".cache",
		"exit-codes-",
	);
	fs.mkdirSync(path.dirname(cacheDir), { recursive: true });
	const cwd = fs.mkdtempSync(cacheDir);
	projects.push(cwd);
	for (const [name, content] of Object.entries(files)) {
		fs.writeFileSync(path.join(cwd, name), content);
	}
	return cwd;
}

function startCli(args: string[], cwd: string) {
	const child = spawn(process.execPath, [cliPath, ...args], {
		cwd,
		env: { ...process.env, BETTER_AUTH_TELEMETRY_DISABLED: "true" },
	});
	// A failed or timed-out test would otherwise leave the CLI running.
	onTestFinished(() => {
		child.kill();
	});
	let output = "";
	child.stdout.on("data", (chunk) => {
		output += chunk;
	});
	child.stderr.on("data", (chunk) => {
		output += chunk;
	});
	const exited = new Promise<number | null>((resolve) => {
		child.on("exit", (code) => resolve(code));
	});
	return {
		child,
		exited,
		output: () => output,
	};
}

async function runCli(args: string[], cwd: string) {
	const run = startCli(args, cwd);
	run.child.stdin.end();
	return {
		exitCode: await run.exited,
		output: run.output(),
	};
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

describe("exit codes", () => {
	it.each(["migrate", "generate"])(
		"%s exits 1 when no configuration file is found",
		async (command) => {
			const cwd = createProject();
			const { exitCode, output } = await runCli([command], cwd);

			expect(output).toContain("No configuration file found");
			expect(exitCode).toBe(1);
		},
	);

	/**
	 * @see https://nodejs.org/api/net.html#socketconnectoptions-connectlistener
	 */
	it("migrate prints the cause of a refused connection without a stack", async () => {
		const cwd = createProject({
			"auth.ts": `import { betterAuth } from "better-auth";

// What a pool rejects with when localhost refuses on both IPv4 and IPv6.
const refused = Object.assign(new AggregateError([], ""), {
	code: "ECONNREFUSED",
});

export const auth = betterAuth({
	database: { connect: async () => Promise.reject(refused) },
});
`,
		});
		const { exitCode, output } = await runCli(["migrate", "--yes"], cwd);

		expect(output).toMatch(/^ECONNREFUSED$/m);
		expect(output).not.toContain("Error running Better Auth CLI");
		expect(exitCode).toBe(1);
	});

	// Windows has no POSIX signals, so kill() terminates without running the handler.
	it.skipIf(process.platform === "win32").each([
		["SIGINT", 130],
		["SIGTERM", 143],
	] as const)("exits %s with %i", async (signal, expected) => {
		const cwd = createProject({
			"auth.ts": `import { betterAuth } from "better-auth";

console.log("loading config");
await new Promise((resolve) => setTimeout(resolve, 60_000));

export const auth = betterAuth({ baseURL: "http://localhost:3000" });
`,
		});
		const run = startCli(["migrate"], cwd);
		await vi.waitUntil(() => run.output().includes("loading config"), {
			timeout: 30_000,
		});

		run.child.kill(signal);

		expect(await run.exited).toBe(expected);
	});
});

describe("non-interactive runs", () => {
	it("migrate exits 2 without migrating when --yes is missing", async () => {
		const cwd = createProject();
		const database = path.join(cwd, "app.db");
		fs.writeFileSync(
			path.join(cwd, "auth.ts"),
			`import { betterAuth } from "better-auth";
import Database from "better-sqlite3";

export const auth = betterAuth({
	database: new Database(${JSON.stringify(database)}),
	baseURL: "http://localhost:3000",
	emailAndPassword: { enabled: true },
});
`,
		);
		const { exitCode, output } = await runCli(["migrate"], cwd);

		expect(output).toContain(
			"Can't run these migrations without --yes in non-interactive mode.",
		);
		expect(exitCode).toBe(2);
		const db = new Database(database);
		const tables = db
			.prepare("SELECT name FROM sqlite_master WHERE type = 'table'")
			.all();
		db.close();
		expect(tables).toEqual([]);
	});

	it("init exits 2 before asking any setup question", async () => {
		const cwd = createProject({ "package.json": "{}" });
		const { exitCode, output } = await runCli(["init"], cwd);

		expect(output).toContain(
			"Can't run auth init without a terminal in non-interactive mode.",
		);
		expect(exitCode).toBe(2);
	});
});
