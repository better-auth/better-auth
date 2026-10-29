import { execFile } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { describe, expect, it, onTestFinished } from "vitest";
import { cliPath } from "./utils";

const execFileAsync = promisify(execFile);

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
	return { home, run, npxCalls };
}

describe.skipIf(process.platform === "win32")("login and logout", () => {
	it("login requests a device code without spawning another CLI", async () => {
		const { run, npxCalls } = await setupCli();
		const requests: string[] = [];
		const server = createServer((req, res) => {
			requests.push(`${req.method} ${req.url}`);
			res.writeHead(400).end();
		});
		onTestFinished(() => {
			server.close();
		});
		await once(server.listen(0, "127.0.0.1"), "listening");
		const { port } = server.address() as AddressInfo;

		await expect(
			run(["login", "--server-url", `http://127.0.0.1:${port}`]),
		).rejects.toThrow();

		expect(await npxCalls()).toEqual([]);
		expect(requests).toEqual(["POST /api/auth/device/code"]);
	});

	it("logout removes the stored token without spawning another CLI", async () => {
		const { home, run, npxCalls } = await setupCli();
		const tokenFile = path.join(home, ".better-auth", "token.json");
		await fs.mkdir(path.dirname(tokenFile), { recursive: true });
		await fs.writeFile(tokenFile, "{}");

		await run(["logout"]);

		expect(await npxCalls()).toEqual([]);
		await expect(fs.access(tokenFile)).rejects.toThrow();
	});
});
