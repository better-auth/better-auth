import { execFile } from "node:child_process";
import { once } from "node:events";
import { existsSync } from "node:fs";
import fs from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { beforeAll, describe, expect, it, onTestFinished } from "vitest";
import { cliPath } from "./utils";

const execFileAsync = promisify(execFile);

beforeAll(() => {
	if (!existsSync(cliPath)) {
		throw new Error(
			`CLI binary not found at "${cliPath}". Run "pnpm --filter auth build" before running this test.`,
		);
	}
});

// The fake `npx` only records calls, so a regression shows up as a log entry
// instead of an unbounded chain of processes.
async function setupCli() {
	const home = await fs.mkdtemp(path.join(os.tmpdir(), "auth-login-"));
	onTestFinished(() => fs.rm(home, { recursive: true, force: true }));
	const npxLog = path.join(home, "npx.log");
	await fs.writeFile(
		path.join(home, "npx"),
		'#!/bin/sh\necho "$*" >> "$NPX_LOG"\n',
		{ mode: 0o755 },
	);

	const run = (args: string[]) =>
		execFileAsync(process.execPath, [cliPath, ...args], {
			cwd: home,
			env: {
				...process.env,
				CI: "1",
				HOME: home,
				PATH: `${home}${path.delimiter}${process.env.PATH}`,
				NPX_LOG: npxLog,
			},
			timeout: 30_000,
		});
	const npxCalls = async () => {
		const content = await fs.readFile(npxLog, "utf-8").catch(() => "");
		return content.split("\n").filter(Boolean);
	};
	return {
		tokenFile: path.join(home, ".better-auth", "token.json"),
		run,
		npxCalls,
	};
}

// Answers each request with the next queued response for its path.
async function startServer(responses: Record<string, object[]>) {
	const requests: string[] = [];
	const server = createServer((req, res) => {
		requests.push(
			`${req.method} ${req.url} ${req.headers.authorization ?? ""}`,
		);
		const body = responses[req.url ?? ""]?.shift();
		if (!body) {
			res.writeHead(400).end();
			return;
		}
		const status = "error" in body ? 400 : 200;
		res.writeHead(status, { "content-type": "application/json" });
		res.end(JSON.stringify(body));
	});
	onTestFinished(() => {
		server.close();
	});
	await once(server.listen(0, "127.0.0.1"), "listening");
	const { port } = server.address() as AddressInfo;
	return { url: `http://127.0.0.1:${port}`, requests };
}

describe.skipIf(process.platform === "win32")("login and logout", () => {
	it("login requests a device code without spawning another CLI", async () => {
		const { run, npxCalls } = await setupCli();
		const server = await startServer({});

		await expect(run(["login", "--server-url", server.url])).rejects.toThrow();

		expect(await npxCalls()).toEqual([]);
		expect(server.requests).toEqual(["POST /api/auth/device/code "]);
	});

	it("login polls until approval and stores the token readable only by its owner", async () => {
		const { tokenFile, run } = await setupCli();
		await fs.mkdir(path.dirname(tokenFile), { mode: 0o755 });
		await fs.writeFile(tokenFile, "{}", { mode: 0o644 });
		const server = await startServer({
			"/api/auth/device/code": [
				{
					device_code: "device-code",
					user_code: "USER-CODE",
					verification_uri: "http://127.0.0.1/device",
					verification_uri_complete:
						"http://127.0.0.1/device?user_code=USER-CODE",
					expires_in: 60,
					interval: 0,
				},
			],
			"/api/auth/device/token": [
				{ error: "authorization_pending", error_description: "Pending" },
				{ access_token: "session-token", token_type: "Bearer", expires_in: 60 },
			],
		});

		await run(["login", "--server-url", server.url]);

		expect(server.requests).toEqual([
			"POST /api/auth/device/code ",
			"POST /api/auth/device/token ",
			"POST /api/auth/device/token ",
		]);
		expect(JSON.parse(await fs.readFile(tokenFile, "utf-8"))).toEqual({
			serverUrl: server.url,
			access_token: "session-token",
		});
		expect((await fs.stat(path.dirname(tokenFile))).mode & 0o777).toBe(0o700);
		expect((await fs.stat(tokenFile)).mode & 0o777).toBe(0o600);
	});

	it("logout revokes the session and removes the token without spawning another CLI", async () => {
		const { tokenFile, run, npxCalls } = await setupCli();
		const server = await startServer({
			"/api/auth/revoke-session": [{ status: true }],
		});
		await fs.mkdir(path.dirname(tokenFile), { recursive: true });
		await fs.writeFile(
			tokenFile,
			JSON.stringify({
				serverUrl: server.url,
				access_token: "session-token",
			}),
		);

		await run(["logout"]);

		expect(await npxCalls()).toEqual([]);
		expect(server.requests).toEqual([
			"POST /api/auth/revoke-session Bearer session-token",
		]);
		await expect(fs.access(tokenFile)).rejects.toThrow();
	});
});
