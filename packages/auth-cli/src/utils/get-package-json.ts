import fs from "node:fs/promises";
import path from "node:path";
import type { Result } from "./utils";
import { tryCatch } from "./utils";

export const getPackageJson = async (
	cwd: string,
): Promise<Result<Record<string, any>>> => {
	const packageJsonPath = path.join(cwd, "package.json");
	const { data, error } = await tryCatch(fs.readFile(packageJsonPath, "utf-8"));
	if (data) {
		const parse = async () => JSON.parse(data);
		const result = await tryCatch<Record<string, any>>(parse());
		return result;
	}
	return { data: null, error: error as Error };
};

/**
 * Checks if a dependency is in the package.json of a given CWD.
 *
 * @returns True if the dependency is in the package.json, false otherwise.
 */
export const hasDependency = async (
	cwd: string,
	dependency: string,
): Promise<boolean> => {
	const { data } = await getPackageJson(cwd);
	if (data) {
		let hasDependency = false;
		if (data.dependencies?.[dependency] !== undefined) {
			hasDependency = true;
		}
		if (data.devDependencies?.[dependency] !== undefined) {
			hasDependency = true;
		}
		if (data.peerDependencies?.[dependency] !== undefined) {
			hasDependency = true;
		}
		return hasDependency;
	}
	return false;
};
