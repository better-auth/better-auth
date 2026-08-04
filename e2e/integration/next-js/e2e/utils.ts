import type { ChildProcessWithoutNullStreams } from "node:child_process";
import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { terminate } from "@better-auth-test/test-utils/playwright";

const root = fileURLToPath(new URL("../", import.meta.url));

async function getAvailablePort() {
	return new Promise<number>((resolve, reject) => {
		const server = createServer();
		server.once("error", reject);
		server.listen(0, "127.0.0.1", () => {
			const address = server.address();
			if (!address || typeof address === "string") {
				server.close();
				reject(new Error("Failed to allocate a port for the Next.js fixture."));
				return;
			}
			server.close((error) => {
				if (error) {
					reject(error);
					return;
				}
				resolve(address.port);
			});
		});
	});
}

async function waitUntilReady(
	child: ChildProcessWithoutNullStreams,
	baseURL: string,
	readOutput: () => string,
) {
	const timeoutAt = Date.now() + 30_000;
	while (Date.now() < timeoutAt) {
		if (child.exitCode !== null) {
			throw new Error(
				`Next.js fixture exited before becoming ready.\n${readOutput()}`,
			);
		}
		try {
			const response = await fetch(baseURL);
			if (response.ok) return;
		} catch {
			// The server is still starting.
		}
		await new Promise((resolve) => setTimeout(resolve, 100));
	}
	throw new Error(`Next.js fixture did not become ready.\n${readOutput()}`);
}

export function setup() {
	let child: ChildProcessWithoutNullStreams | undefined;
	let baseURL = "";
	let databaseDirectory: string | undefined;
	let output = "";

	const clean = async () => {
		try {
			if (child?.pid) {
				await terminate(child.pid);
			}
		} finally {
			child = undefined;
			if (databaseDirectory) {
				const directory = databaseDirectory;
				databaseDirectory = undefined;
				await rm(directory, { force: true, recursive: true });
			}
		}
	};

	return {
		get baseURL() {
			return baseURL;
		},
		get output() {
			return output;
		},
		start: async () => {
			const port = await getAvailablePort();
			baseURL = `http://127.0.0.1:${port}`;
			databaseDirectory = await mkdtemp(
				join(tmpdir(), "better-auth-next-js-e2e-"),
			);
			output = "";
			child = spawn(
				"pnpm",
				["run", "dev", "--hostname", "127.0.0.1", "--port", String(port)],
				{
					cwd: root,
					stdio: "pipe",
					env: {
						...process.env,
						BETTER_AUTH_DATABASE_PATH: join(databaseDirectory, "auth.sqlite"),
						BETTER_AUTH_URL: baseURL,
						NO_COLOR: "1",
					},
				},
			);
			child.stdout.on("data", (data) => {
				output += data.toString();
			});
			child.stderr.on("data", (data) => {
				output += data.toString();
			});
			try {
				await waitUntilReady(child, baseURL, () => output);
			} catch (error) {
				try {
					await clean();
				} catch {
					// Preserve the startup error and its server output.
				}
				throw error;
			}
		},
		clean,
	};
}
