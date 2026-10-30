import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "dotenv";

// Templates and per-mode files such as `.env.production` are often committed,
// so secrets only go to the local override or the base file every loader reads.
const envFileNames = [".env.local", ".env"];

/**
 * Reads the env files `auth init` manages.
 *
 * Loaders such as Next.js and Vite apply `.env.local` on top of `.env`,
 * so a key defined in either file counts as defined.
 *
 * @returns The file to append to, or `null` when neither exists, and the defined keys
 */
export const readEnv = async (cwd: string) => {
	const files = await Promise.all(
		envFileNames.map(async (name) => {
			const file = path.join(cwd, name);
			// Only a missing file counts as absent. Other read errors surface so an
			// unreadable file is never skipped or overwritten.
			const content = await fs
				.readFile(file, "utf-8")
				.catch((error: NodeJS.ErrnoException) => {
					if (error.code === "ENOENT" || error.code === "EISDIR") return null;
					throw error;
				});
			if (content === null) return null;
			return { file, keys: Object.keys(parse(content)) };
		}),
	);
	const existing = files.filter((x) => x !== null);

	return {
		file: existing[0]?.file ?? null,
		keys: new Set(existing.flatMap((x) => x.keys)),
	};
};

export const updateEnvFile = async (
	file: string,
	envs: string[],
): Promise<void> => {
	const content = await fs.readFile(file, "utf-8");
	const lines = content.split("\n");
	lines.push(...envs);
	await fs.writeFile(file, lines.join("\n"), "utf-8");
};

export const createEnvFile = async (
	cwd: string,
	envVariables: string[],
): Promise<void> => {
	const envFile = path.join(cwd, ".env");
	await fs.writeFile(envFile, envVariables.join("\n"), "utf-8");
};
