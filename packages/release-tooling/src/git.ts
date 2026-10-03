import { execFileSync, spawnSync } from "node:child_process";

const gitTimeoutMs = 30_000;
const gitMaxBufferBytes = 8 * 1024 * 1024;

export function runGit(args: string[]): string {
	return execFileSync("git", args, {
		encoding: "utf-8",
		maxBuffer: gitMaxBufferBytes,
		timeout: gitTimeoutMs,
		windowsHide: true,
	});
}

export function gitSucceeds(args: string[]): boolean {
	const result = spawnSync("git", args, {
		stdio: "ignore",
		timeout: gitTimeoutMs,
		windowsHide: true,
	});
	if (result.error) throw result.error;
	return result.status === 0;
}
