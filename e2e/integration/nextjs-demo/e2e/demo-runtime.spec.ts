import { spawn } from "node:child_process";
import { once } from "node:events";
import { expect, test } from "@playwright/test";
import { stopProcess } from "./demo-runtime";

/**
 * @see https://github.com/better-auth/better-auth/pull/11885
 */
test("stops a demo process and waits for its output streams to close", async () => {
	const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
		detached: process.platform !== "win32",
		stdio: "pipe",
	});
	await once(child, "spawn");
	try {
		await stopProcess(child);
		await expect.poll(() => child.stdout.closed, { timeout: 3000 }).toBe(true);
		expect(child.stderr.closed).toBe(true);
		expect(child.exitCode !== null || child.signalCode !== null).toBe(true);
	} finally {
		if (child.exitCode === null && child.signalCode === null) {
			const closed = once(child, "close");
			child.kill("SIGKILL");
			await closed;
		}
	}
});
