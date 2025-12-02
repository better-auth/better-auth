import { exec } from "node:child_process";

export function installDependencies({
	dependencies,
	packageManager,
	cwd,
}: {
	dependencies: string[];
	packageManager: "npm" | "pnpm" | "bun" | "yarn";
	cwd: string;
}): Promise<boolean> {
	let installCommand: string;
	switch (packageManager) {
		case "npm":
			installCommand = "npm install --force";
			break;
		case "pnpm":
			installCommand = "pnpm install";
			break;
		case "bun":
			installCommand = "bun install";
			break;
		case "yarn":
			installCommand = "yarn install";
			break;
		default:
			throw new Error("Invalid package manager");
	}
	const command = `${installCommand} ${dependencies.join(" ")}`;

	return new Promise((resolve, reject) => {
		exec(command, { cwd }, (error, stdout, stderr) => {
			if (error) {
				reject(new Error(stderr));
				return;
			}
			resolve(true);
		});
	});
}
