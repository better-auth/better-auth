import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
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

function createProject(withConfig: boolean) {
	const cacheDir = path.join(
		process.cwd(),
		"node_modules",
		".cache",
		"exit-codes-",
	);
	fs.mkdirSync(path.dirname(cacheDir), { recursive: true });
	const cwd = fs.mkdtempSync(cacheDir);
	projects.push(cwd);
	if (!withConfig) return cwd;
	fs.writeFileSync(
		path.join(cwd, "auth.ts"),
		`import { betterAuth } from "better-auth";
import Database from "better-sqlite3";

export const auth = betterAuth({
	database: new Database(${JSON.stringify(path.join(cwd, "app.db"))}),
	secret: "a-secret-long-enough-to-keep-the-cli-quiet",
	baseURL: "http://localhost:3000",
	emailAndPassword: { enabled: true },
});
`,
	);
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
			const cwd = createProject(false);
			const { exitCode, output } = await runCli([command], cwd);

			expect(output).toContain("No configuration file found");
			expect(exitCode).toBe(1);
		},
	);

	// Windows has no POSIX signals, so kill() terminates without running the handler.
	it.skipIf(process.platform === "win32").each([
		["SIGINT", 130],
		["SIGTERM", 143],
	] as const)("exits %s with %i", async (signal, expected) => {
		const cwd = createProject(true);
		const run = startCli(["migrate"], cwd);
		await vi.waitUntil(() => run.output().includes("run these migrations"), {
			timeout: 30_000,
		});

		run.child.kill(signal);

		expect(await run.exited).toBe(expected);
	});
});
