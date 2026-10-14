import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { spawn } from "node:child_process";
import { createServer } from "node:http";
import { resolve } from "node:path";
import type { APIRequestContext } from "@playwright/test";
import { expect } from "@playwright/test";

export const demoDirectory = resolve(process.cwd(), "../../demo/nextjs");

export interface DemoProcess {
	process: ChildProcessWithoutNullStreams;
	readOutput: () => string;
}

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

export async function stopProcess(
	child: ChildProcessWithoutNullStreams | undefined,
): Promise<void> {
	if (!child?.pid || child.exitCode !== null) return;
	const { terminate } = await import("@better-auth-test/test-utils/playwright");
	await terminate(child.pid);
}

/**
 * Runs a one-shot `node --experimental-strip-types` command in the demo
 * directory and resolves with its stdout. Rejects with all output on a
 * non-zero exit.
 */
export async function runDemoNodeScript(
	args: string[],
	environment: NodeJS.ProcessEnv,
	label: string,
): Promise<string> {
	const child = spawn("node", ["--experimental-strip-types", ...args], {
		cwd: demoDirectory,
		env: environment,
		stdio: "pipe",
	});
	let stdout = "";
	let output = "";
	child.stdout.on("data", (chunk) => {
		stdout += chunk.toString();
		output += chunk.toString();
	});
	child.stderr.on("data", (chunk) => {
		output += chunk.toString();
	});
	const exitCode = await new Promise<number | null>((resolveExit, reject) => {
		child.once("error", reject);
		child.once("exit", resolveExit);
	});
	if (exitCode !== 0) {
		throw new Error(`${label} failed:\n${output}`);
	}
	return stdout;
}

export async function migrateDemoDatabase(
	environment: NodeJS.ProcessEnv,
): Promise<void> {
	await runDemoNodeScript(
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
		environment,
		"Next.js demo migration",
	);
}

/**
 * Spawns a long-running process in the demo directory (detached, so
 * `stopProcess` can terminate the whole tree) and polls `readyURL` until it
 * answers 2xx.
 */
export async function startDemoProcess(input: {
	command: string;
	args: string[];
	environment: NodeJS.ProcessEnv;
	readyURL: string;
	label: string;
}): Promise<DemoProcess> {
	let output = "";
	const child = spawn(input.command, input.args, {
		cwd: demoDirectory,
		detached: true,
		env: input.environment,
		stdio: "pipe",
	});
	child.stdout.on("data", (chunk) => {
		output += chunk.toString();
	});
	child.stderr.on("data", (chunk) => {
		output += chunk.toString();
	});
	try {
		const deadline = Date.now() + 60_000;
		while (Date.now() < deadline) {
			if (child.exitCode !== null) {
				throw new Error(`${input.label} exited before startup:\n${output}`);
			}
			try {
				const response = await fetch(input.readyURL, {
					signal: AbortSignal.timeout(1_000),
				});
				if (response.ok) {
					return { process: child, readOutput: () => output };
				}
			} catch {
				// The server has not bound its port yet.
			}
			await new Promise((resolveDelay) => setTimeout(resolveDelay, 250));
		}
		throw new Error(`${input.label} did not start:\n${output}`);
	} catch (error) {
		await stopProcess(child);
		throw error;
	}
}

export async function startNextDevServer(
	port: number,
	environment: NodeJS.ProcessEnv,
): Promise<DemoProcess> {
	return await startDemoProcess({
		command: "pnpm",
		args: ["dev", "--hostname", "127.0.0.1", "--port", String(port)],
		environment,
		readyURL: `http://127.0.0.1:${port}/sign-in`,
		label: "Next.js demo",
	});
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
