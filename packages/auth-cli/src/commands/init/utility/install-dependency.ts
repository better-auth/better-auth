import { exec } from "node:child_process";
import type { PackageManager } from "./get-package-manager";
import { getPackageManager } from "./get-package-manager";

export const installDependency = async (
	dependency: string | string[],
	{
		pm,
		cwd,
	}: {
		pm?: PackageManager;
		cwd: string;
	},
): Promise<void> => {
	// If package manager is not provided, get it from the current working directory
	pm = await (async (packageManager) => {
		if (packageManager) return packageManager;
		const { pm } = await getPackageManager(cwd);
		return pm;
	})(pm);

	let depString: string;

	if (Array.isArray(dependency)) {
		depString = dependency.join(" ");
	} else {
		depString = dependency;
	}

	return new Promise((resolve, reject) =>
		exec(`${pm} install ${depString}`, { cwd }, (error, stdout, stderr) => {
			if (error) {
				reject(new Error(stderr));
				return;
			}
			resolve();
		}),
	);
};
