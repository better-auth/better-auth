import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "dotenv";

// Templates and per-mode files such as `.env.production` are often committed,
// so secrets only go to the local override or the base file every loader reads.
const envFileNames = [".env.local", ".env"];

export const getEnvFiles = async (cwd: string): Promise<string[]> => {
	for (const name of envFileNames) {
		const file = path.join(cwd, name);
		const stat = await fs.stat(file).catch(() => null);
		if (stat?.isFile()) return [file];
	}
	return [];
};

export const parseEnvFiles = async (envFiles: string[]) => {
	const result = new Map<string, string[]>();
	for (const file of envFiles) {
		const content = await fs.readFile(file, "utf-8");
		result.set(file, Object.keys(parse(content)));
	}

	return result;
};

export const updateEnvFiles = async (
	envFiles: string[],
	envs: string[],
): Promise<void> => {
	for (const file of envFiles) {
		const content = await fs.readFile(file, "utf-8");
		const lines = content.split("\n");
		lines.push(...envs);
		await fs.writeFile(file, lines.join("\n"), "utf-8");
	}
};

/**
 * Gets the missing env variables in the env files
 *
 * @param envFiles - The list of env files to check
 * @param envVar - The env variable to check
 * @returns The list of env files that are missing the env variable
 */
export const getMissingEnvVars = async (
	envFiles: Map<string, string[]>,
	envVar: string | string[],
): Promise<{ file: string; var: string[] }[]> => {
	const missingVarInFiles: { file: string; var: string[] }[] = [];
	for (const [file, existingVars] of envFiles) {
		if (Array.isArray(envVar)) {
			const missingVars = envVar.filter((v) => !existingVars.includes(v));
			if (missingVars.length > 0) {
				missingVarInFiles.push({
					file,
					var: missingVars,
				});
			}
		} else if (typeof envVar === "string" && !existingVars.includes(envVar)) {
			missingVarInFiles.push({ file, var: [envVar] });
		}
	}
	return missingVarInFiles;
};

export const createEnvFile = async (
	cwd: string,
	envVariables: string[],
): Promise<void> => {
	const envFile = path.join(cwd, ".env");
	await fs.writeFile(envFile, envVariables.join("\n"), "utf-8");
};
