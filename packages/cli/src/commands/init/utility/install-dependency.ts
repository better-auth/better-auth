import { exec } from "child_process";
import { getPackageManager, type PackageManager } from "./get-package-manager";

export const installDependency = async (
	dependency: string,
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

	return new Promise((resolve, reject) =>
		exec(`${pm} install ${dependency}`, { cwd }, (error, stdout, stderr) => {
			if (error) {
				reject(new Error(stderr));
				return;
			}
			resolve();
		}),
	);
};
