import type { ChildProcess } from "node:child_process";
import { execFile } from "node:child_process";
import { once } from "node:events";
import { promisify } from "node:util";

// Spawn with detached: true on Unix so the child owns its process group.
export async function terminate(child: ChildProcess): Promise<void> {
	const pid = child.pid;
	if (pid === undefined) return;

	const exited = child.exitCode !== null || child.signalCode !== null;
	if (process.platform === "win32" && exited) {
		return;
	}

	const closed = exited
		? Promise.resolve()
		: once(child, "close", { signal: AbortSignal.timeout(5000) });
	const killing = Promise.resolve().then(async () => {
		if (process.platform === "win32") {
			try {
				await promisify(execFile)(
					"taskkill",
					["/pid", String(pid), "/T", "/F"],
					{
						timeout: 5000,
						windowsHide: true,
					},
				);
			} catch (error) {
				if (child.exitCode === null && child.signalCode === null) throw error;
			}
		} else {
			try {
				process.kill(-pid, "SIGKILL");
			} catch (error) {
				if (
					!(error instanceof Error && "code" in error && error.code === "ESRCH")
				) {
					throw error;
				}
			}
		}
	});
	await Promise.all([closed, killing]);
}
