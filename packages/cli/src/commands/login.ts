import { spawn } from "node:child_process";
import { log } from "@clack/prompts";
import { Command } from "commander";
import * as z from "zod/v4";

async function execCommand(cmd: string) {
	try {
		await new Promise<void>((resolve, reject) => {
			const child = spawn(cmd, {
				cwd: process.cwd(),
				stdio: "inherit",
				shell: true,
			});
			child.on("close", (code, signal) => {
				if (code !== 0 && code !== null) {
					reject(new Error(`Exited with code ${code}`));
				} else if (signal) {
					reject(new Error(`Killed with signal ${signal}`));
				} else {
					resolve();
				}
			});
			child.on("error", reject);
		});
	} catch (error: any) {
		log.error(error.message || "An unknown error occurred");
		process.exit(1);
	}

	process.exit(0);
}

async function loginAction(opts: any) {
	const options = z
		.object({
			local: z.boolean().optional(),
		})
		.parse(opts);

	let loginCommand = "npx @better-auth/cli@latest login";
	if (options.local) loginCommand += " --local";

	await execCommand(loginCommand);
}

export const login = new Command("login")
	.description("Login to Better Auth Infrastructure")
	.option("--local", "Use local development server (localhost:3001)")
	.action(loginAction);

async function logoutAction() {
	await execCommand("npx @better-auth/cli@latest logout");
}

export const logout = new Command("logout")
	.description("Logout from Better Auth Infrastructure")
	.action(logoutAction);
