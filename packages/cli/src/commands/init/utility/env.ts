import fs from "node:fs/promises";
import path from "node:path";

export const getEnvFiles = async (cwd: string): Promise<string[]> => {
	const envFiles = await fs.readdir(cwd, "utf-8");
	return envFiles.filter((file) => file.startsWith(".env"));
};

export const updateEnvFiles = async (
	envFiles: string[],
	envs: string[],
): Promise<void> => {
	for (const file of envFiles) {
		const content = await fs.readFile(file, "utf-8");
		const lines = content.split("\n");
		const newLines = envs.map((env) => `${env}=${env}`);
		await fs.writeFile(file, newLines.join("\n"), "utf-8");
	}
};

/**
 * Checks if the env variable is present in the env files
 *
 * @param envFiles - The list of env files to check
 * @param envVar - The env variable to check
 * @returns The list of env files that are missing the env variable
 */
export const hasEnvVar = async (
	envFiles: string[],
	envVar: string | string[],
): Promise<{ missingVarInFiles: { file: string; var: string[] }[] }> => {
	let missingVarInFiles: { file: string; var: string[] }[] = [];
	for (const file of envFiles) {
		const content = await fs.readFile(file, "utf-8");
		if (Array.isArray(envVar) && envVar.some((v) => content.includes(v))) {
			const missingVars = envVar.filter((v) => content.includes(v));
			if (missingVars.length > 0) continue;
			missingVarInFiles.push({
				file,
				var: missingVars,
			});
		} else if (typeof envVar === "string" && content.includes(envVar)) {
			missingVarInFiles.push({ file, var: [envVar] });
		}
	}
	return { missingVarInFiles };
};

export const createEnvFile = async (
	cwd: string,
	envVariables: string[],
): Promise<void> => {
	const envFile = path.join(cwd, ".env");
	await fs.writeFile(envFile, envVariables.join("\n"), "utf-8");
};
