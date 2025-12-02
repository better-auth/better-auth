import { exec } from "node:child_process";

function checkCommand(command: string): Promise<boolean> {
	return new Promise((resolve) => {
		exec(`${command} --version`, (error) => {
			if (error) {
				resolve(false); // Command not found or error occurred
			} else {
				resolve(true); // Command exists
			}
		});
	});
}

export async function checkPackageManagers(): Promise<{
	hasPnpm: boolean;
	hasBun: boolean;
}> {
	const hasPnpm = await checkCommand("pnpm");
	const hasBun = await checkCommand("bun");

	return {
		hasPnpm,
		hasBun,
	};
}
