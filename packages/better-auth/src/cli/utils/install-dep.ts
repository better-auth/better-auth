import ora from "ora";
import prompts from "prompts";
import { getPackageManager } from "./get-package-manager";
import { execa } from "execa";

export async function installDependency(pkgName: string) {
	const { install } = await prompts({
		name: "install",
		type: "confirm",
		message: `The package "${pkgName}" is required. Do you want to install it?`,
	});
	if (install) {
		const spinner = ora(`Installing ${pkgName}...`).start();
		const packageManager = await getPackageManager(process.cwd());
		await execa(packageManager, [
			packageManager === "npm" ? "install" : "add",
			"pg",
		]);
		spinner.succeed("pg installed successfully");
	}
}
