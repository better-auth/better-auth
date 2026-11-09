import type { ChildProcess } from "node:child_process";
import { execFile, spawn } from "node:child_process";
import { once } from "node:events";
import { createInterface } from "node:readline";
import { promisify } from "node:util";

// Build and server share one log, so a report shows both.
export function launch(cwd: string) {
	const children = new Set<ChildProcess>();
	let output = "";

	function spawnScript(args: readonly string[]) {
		const child = spawn("pnpm", args, {
			detached: process.platform !== "win32",
			cwd,
			// Nothing writes to stdin, so leave no pipe open for a child to wait on.
			stdio: ["ignore", "pipe", "pipe"],
			env: { ...process.env, NO_COLOR: "1" },
		});
		children.add(child);
		// A closed child's pid can be reused, so `stop` must not signal it.
		child.once("close", () => children.delete(child));
		child.stderr.setEncoding("utf8").on("data", (data) => (output += data));
		const lines = createInterface({ input: child.stdout });
		lines.on("line", (line) => (output += `${line}\n`));
		const exitError = (code: number | null, signal: NodeJS.Signals | null) =>
			new Error(
				`pnpm ${args.join(" ")} exited with ${signal ?? `code ${code}`}\n${output}`,
			);
		return { child, lines, exitError };
	}

	return {
		output: () => output,
		run: async (args: readonly string[]) => {
			const { child, exitError } = spawnScript(args);
			const [code, signal] = await once(child, "close");
			if (code !== 0) throw exitError(code, signal);
		},
		start: (args: readonly string[]) => {
			const { child, lines, exitError } = spawnScript(args);
			return new Promise<string>((resolve, reject) => {
				lines.on("line", (line) => {
					const match = line.match(/http:\/\/localhost:\d+/);
					if (match) resolve(match[0]);
				});
				child.once("error", reject);
				child.once("close", (code, signal) => reject(exitError(code, signal)));
			});
		},
		stop: () => Promise.all([...children].map(terminate)),
	};
}

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
