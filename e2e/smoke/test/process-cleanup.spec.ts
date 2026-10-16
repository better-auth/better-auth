import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import { describe, test } from "node:test";
import { setTimeout as delay } from "node:timers/promises";
import { terminate } from "@better-auth-test/test-utils/playwright";

test("process cleanup terminates a running child", {
	timeout: 10000,
}, async (context) => {
	const child = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], {
		stdio: "ignore",
		detached: process.platform !== "win32",
	});
	context.after(() => {
		if (child.exitCode === null && child.signalCode === null) {
			child.kill("SIGKILL");
		}
	});
	await once(child, "spawn");
	await terminate(child);

	assert.ok(child.exitCode !== null || child.signalCode !== null);
	await terminate(child);
});

test("process cleanup accepts an already exited child", async () => {
	const child = spawn(process.execPath, ["-e", ""], { stdio: "ignore" });
	await once(child, "exit");

	await terminate(child);
});

/**
 * @see https://man7.org/linux/man-pages/man2/waitpid.2.html
 */
describe("process tree cleanup", () => {
	for (const parentExits of [false, true]) {
		test(`terminates descendants when the parent ${parentExits ? "has exited" : "is running"}`, {
			skip: process.platform !== "linux",
			timeout: 10000,
		}, async (context) => {
			const child = spawn(
				process.execPath,
				[
					"-e",
					`
				const { spawn } = require("node:child_process");
				const descendant = spawn(process.execPath, ["-e", "setInterval(() => {}, 1000)"], { stdio: "ignore" });
				descendant.once("spawn", () => {
					process.stdout.write(String(descendant.pid), () => {
						if (${parentExits}) process.exit(0);
					});
				});
				setInterval(() => {}, 1000);
			`,
				],
				{ stdio: ["ignore", "pipe", "inherit"], detached: true },
			);
			let descendantPid: number | undefined;
			context.after(() => {
				if (descendantPid !== undefined) {
					try {
						process.kill(descendantPid, "SIGKILL");
					} catch (error) {
						assert.ok(error instanceof Error && "code" in error);
						assert.equal(error.code, "ESRCH");
					}
				}
				if (child.exitCode === null && child.signalCode === null) {
					child.kill("SIGKILL");
				}
			});
			const parentClosed = parentExits ? once(child, "close") : undefined;
			const [output]: unknown[] = await once(child.stdout, "data");
			descendantPid = Number(String(output));
			assert.ok(Number.isSafeInteger(descendantPid) && descendantPid > 0);

			await parentClosed;
			await terminate(child);
			assert.ok(child.exitCode !== null || child.signalCode !== null);

			for (let attempt = 0; attempt < 100; attempt++) {
				const stat = await fs
					.readFile(`/proc/${descendantPid}/stat`, "utf8")
					.catch((error: unknown) => {
						assert.ok(error instanceof Error && "code" in error);
						assert.equal(error.code, "ENOENT");
						return null;
					});
				if (stat === null || /\) [ZX] /.test(stat)) return;
				await delay(10);
			}
			assert.fail("Descendant is still running after process cleanup");
		});
	}
});
