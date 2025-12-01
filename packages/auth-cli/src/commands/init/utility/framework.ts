import { hasDependency } from "../../../utils/get-package-json";
import type { Framework } from "../configs/frameworks.config";
import { FRAMEWORKS } from "../configs/frameworks.config";

/**
 * Attempt to auto-detect the web-framework based on information provided in the CWD.
 * @param cwd The current working directory of the project.
 * @returns The detected framework or null if no framework could be detected.
 */
export const autoDetectFramework = async (
	cwd: string,
): Promise<Framework | null> => {
	let framework: Framework | null = null;

	for (const i of FRAMEWORKS) {
		const hasDep = await hasDependency(cwd, i.dependency);
		if (hasDep) {
			framework = i;
			break;
		}
	}

	return framework;
};
