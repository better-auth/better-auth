import type { ChildProcess } from "node:child_process";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import type { APIRequestContext } from "@playwright/test";
import { expect } from "@playwright/test";

const demoDirectory = resolve(process.cwd(), "../../demo/nextjs");

// Playwright's request client ignores the server's `Keep-Alive: timeout` and
// can reuse a connection just as the dev server closes it. The server resets
// that request without reading it, so one retry is safe.
export const CONNECTION_RESET_RETRIES = 1;

export async function getAvailablePort(): Promise<number> {
	const server = createServer();
	const port = await new Promise<number>((resolvePort, reject) => {
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (address && typeof address === "object") {
				resolvePort(address.port);
				return;
			}
			reject(new Error("Could not reserve a port for the Next.js demo"));
		});
	});
	await new Promise<void>((resolveClose, reject) => {
		server.close((error) => (error ? reject(error) : resolveClose()));
	});
	return port;
}

export type DemoRuntime = ReturnType<typeof createDemoRuntime>;

// Startup state lives here so `afterAll` can clean up wherever startup stopped.
export function createDemoRuntime(temporaryDirectoryPrefix: string) {
	const children = new Set<ChildProcess>();
	let output = "";
	let temporaryDirectory: string | undefined;
	let stopped = false;

	function spawnLogged(
		command: string,
		args: readonly string[],
		env: NodeJS.ProcessEnv,
	) {
		// A timed-out `start` keeps running after `stop`, so it must not spawn.
		if (stopped) throw new Error("Next.js demo stopped during startup");
		const child = spawn(command, args, {
			cwd: demoDirectory,
			detached: process.platform !== "win32",
			env,
			// Nothing writes to stdin, so leave no pipe open for a child to wait on.
			stdio: ["ignore", "pipe", "pipe"],
		});
		children.add(child);
		// An unhandled spawn error would crash the worker.
		child.on("error", (error) => (output += `${error}\n`));
		// A closed child's pid can be reused, so `stop` must not signal it.
		child.once("close", () => children.delete(child));
		child.stdout.setEncoding("utf8").on("data", (data) => (output += data));
		child.stderr.setEncoding("utf8").on("data", (data) => (output += data));
		return child;
	}

	/** Runs a one-shot node script in the demo directory and returns its stdout. */
	async function run(
		args: readonly string[],
		env: NodeJS.ProcessEnv,
		label: string,
	) {
		const child = spawnLogged(
			"node",
			["--experimental-strip-types", ...args],
			env,
		);
		let stdout = "";
		child.stdout.on("data", (data) => (stdout += data));
		const [exitCode] = await once(child, "close");
		if (exitCode !== 0) throw new Error(`${label} failed:\n${output}`);
		return stdout;
	}

	/** Spawns a long-running process and polls `readyURL` until it answers 2xx. */
	async function start(input: {
		command: string;
		args: readonly string[];
		env: NodeJS.ProcessEnv;
		readyURL: string;
		label: string;
	}) {
		const child = spawnLogged(input.command, input.args, input.env);
		const deadline = Date.now() + 60_000;
		while (Date.now() < deadline) {
			if (child.exitCode !== null || child.signalCode !== null) {
				throw new Error(`${input.label} exited before startup:\n${output}`);
			}
			try {
				const response = await fetch(input.readyURL, {
					signal: AbortSignal.timeout(1_000),
				});
				if (response.ok) return;
			} catch {
				// The server has not bound its port yet.
			}
			await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
		}
		throw new Error(`${input.label} did not start:\n${output}`);
	}

	return {
		output: () => output,
		temporaryDirectory: async () =>
			(temporaryDirectory ??= await mkdtemp(
				join(tmpdir(), temporaryDirectoryPrefix),
			)),
		run,
		start,
		migrate: (env: NodeJS.ProcessEnv) =>
			run(
				[
					"--input-type=module",
					"--eval",
					[
						'import { getMigrations } from "better-auth/db/migration";',
						'const { auth } = await import("./lib/auth.ts");',
						"const { runMigrations } = await getMigrations(auth.options);",
						"await runMigrations();",
					].join("\n"),
				],
				env,
				"Next.js demo migration",
			),
		startNextDev: async (port: number, env: NodeJS.ProcessEnv) => {
			// `next dev` allows one server per project directory. When another demo spec
			// holds it (parallel local workers), wait for that spec to stop its server.
			const deadline = Date.now() + 180_000;
			for (;;) {
				// The log is shared, so judge each attempt by its own output.
				const attemptOutputStart = output.length;
				try {
					return await start({
						command: "pnpm",
						args: ["dev", "--hostname", "127.0.0.1", "--port", String(port)],
						env,
						readyURL: `http://127.0.0.1:${port}/sign-in`,
						label: "Next.js demo",
					});
				} catch (error) {
					const busy = output
						.slice(attemptOutputStart)
						.includes("Another next dev server is already running");
					if (!busy || Date.now() > deadline) throw error;
					await new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000));
				}
			}
		},
		stop: async () => {
			stopped = true;
			const { terminate } = await import(
				"@better-auth-test/test-utils/playwright"
			);
			await Promise.all([...children].map(terminate));
			if (!temporaryDirectory) return;
			await rm(temporaryDirectory, { recursive: true, force: true });
		},
	};
}

/** Creates an organization as the signed-in user and returns its ID. */
export async function createOrganization(
	request: APIRequestContext,
	baseURL: string,
	name: string,
): Promise<string> {
	const response = await request.post(
		`${baseURL}/api/auth/organization/create`,
		{
			headers: { origin: baseURL },
			data: {
				name,
				slug: `${name.toLowerCase().replaceAll(" ", "-")}-${Date.now()}`,
			},
			maxRetries: CONNECTION_RESET_RETRIES,
		},
	);
	const body: unknown = await response.json();
	expect(response.ok(), JSON.stringify(body)).toBe(true);
	if (
		typeof body !== "object" ||
		body === null ||
		!("id" in body) ||
		typeof body.id !== "string"
	) {
		throw new Error("Organization create did not return an ID");
	}
	return body.id;
}
