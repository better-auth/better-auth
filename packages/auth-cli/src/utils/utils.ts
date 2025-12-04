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
