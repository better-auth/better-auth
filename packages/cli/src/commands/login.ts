import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { setTimeout as sleep } from "node:timers/promises";
import { intro, log, outro } from "@clack/prompts";
import { createAuthClient } from "better-auth/client";
import { deviceAuthorizationClient } from "better-auth/client/plugins";
import chalk from "chalk";
import { Command } from "commander";
import open from "open";
import yoctoSpinner from "yocto-spinner";

const TOKEN_FILE = path.join(os.homedir(), ".better-auth", "token.json");

async function loginAction(options: { serverUrl: string; clientId: string }) {
	const authClient = createAuthClient({
		baseURL: options.serverUrl,
		plugins: [deviceAuthorizationClient()],
	});

	intro(chalk.bold("Better Auth CLI Login (Demo)"));
	const { data: code, error } = await authClient.device.code({
		client_id: options.clientId,
		scope: "openid profile email",
	});
	if (!code) {
		log.error(
			`Failed to request device authorization: ${error.error_description}`,
		);
		process.exit(1);
	}

	log.info(
		`Visit ${chalk.underline(code.verification_uri)} and enter ${chalk.bold(code.user_code)}`,
	);
	// CI has no browser to open, so the printed URL is enough there.
	if (!process.env.CI) {
		await open(code.verification_uri_complete).catch(() => null);
	}

	const spinner = yoctoSpinner({
		text: "Waiting for authorization...",
	}).start();
	const expiresAt = Date.now() + code.expires_in * 1000;
	let interval = code.interval;
	while (Date.now() < expiresAt) {
		await sleep(interval * 1000);
		const { data: token, error } = await authClient.device.token({
			grant_type: "urn:ietf:params:oauth:grant-type:device_code",
			device_code: code.device_code,
			client_id: options.clientId,
		});
		if (error?.error === "authorization_pending") continue;
		if (error?.error === "slow_down") {
			interval += 5;
			continue;
		}
		spinner.stop();
		if (!token) {
			log.error(error.error_description);
			process.exit(1);
		}

		await fs.mkdir(path.dirname(TOKEN_FILE), { recursive: true });
		await fs.writeFile(
			TOKEN_FILE,
			JSON.stringify({ access_token: token.access_token }),
		);
		outro(chalk.green("Demo login successful!"));
		return;
	}

	spinner.stop();
	log.error("The device code has expired. Please try again.");
	process.exit(1);
}

export const login = new Command("login")
	.description(
		"Demo: Test device authorization flow with Better Auth demo server",
	)
	.option(
		"--server-url <url>",
		"The Better Auth server URL",
		"https://demo.better-auth.com",
	)
	.option("--client-id <id>", "The OAuth client ID", "better-auth-cli")
	.action(loginAction);

async function logoutAction() {
	await fs.rm(TOKEN_FILE, { force: true });
	log.success("Logged out from the Better Auth demo server");
}

export const logout = new Command("logout")
	.description("Remove the token stored by the demo login")
	.action(logoutAction);
