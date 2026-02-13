import { spawn } from "node:child_process";
import Crypto from "node:crypto";

type Success<T> = {
	data: T;
	error: null;
};

type Failure<E> = {
	data: null;
	error: E;
};

export type Result<T, E = Error> = Success<T> | Failure<E>;

export async function tryCatch<T, E = Error>(
	promise: Promise<T>,
): Promise<Result<T, E>> {
	try {
		const data = await promise;
		return { data, error: null };
	} catch (error) {
		return { data: null, error: error as E };
	}
}

export function enterAlternateScreen() {
	process.stdout.write("\u001B[?1049h");
	process.stdout.write("\u001B[2J"); // Clear screen
	process.stdout.write("\u001B[H"); // Move cursor to home
}

export function exitAlternateScreen() {
	process.stdout.write("\u001B[?1049l");
}

export const generateSecretHash = () => {
	return Crypto.randomBytes(16).toString("hex");
};

export const spawnCommand = (cmd: string, cwd: string = process.cwd()) =>
	new Promise<void>((resolve, reject) => {
		const child = spawn(cmd, {
			cwd,
			stdio: "inherit",
			shell: true,
		});
		child.on("close", (code, signal) => {
			if (code !== 0 && code !== null) {
				reject(new Error(`Exited with code ${code}`));
			} else if (signal) {
				reject(new Error(`Killed with signal ${signal}`));
			} else {
				resolve();
			}
		});
		child.on("error", reject);
	});
