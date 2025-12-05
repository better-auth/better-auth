import fs from "node:fs/promises";
import path from "node:path";

export const getEnvFiles = async (cwd: string): Promise<string[]> => {
	const envFiles = await fs.readdir(cwd, "utf-8");
	return envFiles
		.filter((file) => file.startsWith(".env"))
		.map((file) => path.join(cwd, file));
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
	envFiles: string[],
	envVar: string | string[],
): Promise<{ file: string; var: string[] }[]> => {
	let missingVarInFiles: { file: string; var: string[] }[] = [];
	for (const file of envFiles) {
		const content = await fs.readFile(file, "utf-8");
		const existingVars = content
			.split("\n")
			.filter((line) => line.trim())
			.map((x) => x.split("=")[0])
			.filter((x) => x && x.trim())
			.filter((x) => !x?.includes(" "))
			.filter((x) => !x?.startsWith("#")) as string[];

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
