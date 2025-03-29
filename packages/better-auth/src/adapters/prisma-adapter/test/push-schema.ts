import { exec } from "child_process";

/**
 * Executes a command line command asynchronously.
 *
 * @param command The command to execute.
 * @returns A promise that resolves with the standard output of the command
 *          or rejects with an error if the command fails.
 */
async function executeCommandLine(command: string): Promise<string> {
	return new Promise((resolve, reject) => {
		exec(command, (error, stdout, stderr) => {
			if (error) {
				console.error(`Error executing command: ${command}`);
				console.error(`stderr: ${stderr}`);
				reject(error);
				return;
			}

			if (stderr) {
				console.warn(`Command produced stderr: ${stderr}`);
			}

			resolve(stdout);
		});
	});
}

export async function pushPrismaSchema(schema: "normal" | "number-id") {
	if (schema === "normal") {
		await executeCommandLine("pnpm prisma:normal:push");
	} else {
		await executeCommandLine("pnpm prisma:number-id:push");
	}
}
