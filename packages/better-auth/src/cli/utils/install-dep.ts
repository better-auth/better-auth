import yoctoSpinner from "yocto-spinner";
import prompts from "prompts";
import { getPackageManager } from "./get-package-manager";
import { x } from "tinyexec";

export async function installDependency(pkgName: string) {
	const { install } = await prompts({
		name: "install",
		type: "confirm",
		message: `The package "${pkgName}" is required. Do you want to install it?`,
	});
	if (install) {
		const spinner = yoctoSpinner({ text: `Installing ${pkgName}...` }).start();
		const packageManager = await getPackageManager(process.cwd());
		await x(packageManager, [
			packageManager === "npm" ? "install" : "add",
			"pg",
		]);
		spinner.success("pg installed successfully");
	}
}
