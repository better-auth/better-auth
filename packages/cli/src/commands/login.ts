import * as p from "@clack/prompts";
import { createAuthClient } from "better-auth/client";
import { deviceAuthorizationClient } from "better-auth/client/plugins";
import chalk from "chalk";
import { Command } from "commander";
import open from "open";
import { getInfraBaseURL, sleep } from "../utils/helper";
import {
	clearStoredToken,
	formatUserCode,
	getStoredToken,
	storeToken,
} from "../utils/storage";

export const authClient = createAuthClient({
	baseURL: getInfraBaseURL(),
	plugins: [deviceAuthorizationClient()],
});

export async function loginAction() {
	p.intro(chalk.bgCyan(chalk.black(" Better Auth Login ")));

	await handleLogin().catch((err) => {
		p.log.error(err.message ?? "An unknown error occurred");
		process.exit(1);
	});

	p.outro(chalk.green("✓ Successfully logged in!"));
}

export const login = new Command("login")
	.description("Login to Better Auth Infrastructure")
	.action(loginAction);

export async function handleLogin() {
	// Check for existing token
	const existingToken = await getStoredToken();
	if (existingToken) {
		try {
			const session = (await authClient.$fetch("/cli-session", {
				headers: {
					Authorization: `Bearer ${existingToken.access_token}`,
				},
				throw: true,
			})) as { user: { name?: string | undefined; email: string } };

			if (session?.user) {
				p.log.success(
					`Already logged in as ${chalk.bold(session.user.name || session.user.email)}`,
				);

				const shouldReauth = await p.confirm({
					message: "Do you want to log in again?",
					initialValue: false,
				});

				if (p.isCancel(shouldReauth) || !shouldReauth) {
					p.outro("Login cancelled.");
					return;
				}
			}
		} catch {
			// Token is invalid, continue with new authentication
			p.log.info("Previous session expired, starting new authentication...");
		}
	}

	const spinner = p.spinner();
	spinner.start("Requesting device authorization...");

	try {
		const { data, error } = await authClient.device.code({
			client_id: "better-auth-cli",
			scope: "openid profile email",
		});

		if (error || !data) {
			spinner.stop("Failed to request device authorization");
			p.log.error(
				error?.error_description ||
					error?.error ||
					"Unknown error occurred while requesting device code",
			);
			process.exit(1);
		}

		const {
			device_code,
			user_code,
			verification_uri,
			verification_uri_complete,
			interval = 5,
		} = data;

		spinner.stop("Device code received");

		console.log();
		p.note(
			`${chalk.bold.cyan(formatUserCode(user_code))}\n\n${chalk.dim(
				`Visit: ${verification_uri}`,
			)}`,
			"Enter this code in your browser",
		);
		console.log();

		const shouldOpenBrowser = await p.confirm({
			message: "Open browser to complete authentication?",
			initialValue: true,
		});

		if (p.isCancel(shouldOpenBrowser)) {
			p.cancel("Authentication cancelled.");
			process.exit(0);
		}

		if (shouldOpenBrowser) {
			const urlToOpen = verification_uri_complete || verification_uri;
			await open(urlToOpen);
			p.log.info(`Browser opened to ${chalk.cyan(verification_uri)}`);
		}

		spinner.start("Waiting for authorization...");

		const accessToken = await pollForToken({
			deviceCode: device_code,
			interval,
			spinner,
		});

		if (accessToken) {
			spinner.stop("Authorization successful!");
			await storeToken(accessToken);

			// Get user info
			try {
				const { data: session } = await authClient.getSession({
					fetchOptions: {
						headers: {
							Authorization: `Bearer ${accessToken.access_token}`,
						},
					},
				});

				if (session?.user) {
					p.log.success(
						`Logged in as ${chalk.bold(session.user.name || session.user.email)}`,
					);
				}
			} catch {
				// Session fetch failed, but authentication succeeded
			}
		} else {
			throw new Error("Failed to get access token");
		}
	} catch (err) {
		spinner.stop("Authentication failed");
		p.log.error(err instanceof Error ? err.message : String(err));
		process.exit(1);
	}
}

export async function logoutAction() {
	p.intro(chalk.bgCyan(chalk.black(" Better Auth Logout ")));

	const token = await getStoredToken();
	if (!token) {
		p.log.info("You are not logged in.");
		p.outro("Nothing to do.");
		return;
	}

	await clearStoredToken();
	p.outro(chalk.green("✓ Successfully logged out!"));
}

export const logout = new Command("logout")
	.description("Logout from Better Auth Infrastructure")
	.action(logoutAction);

interface PollOptions {
	deviceCode: string;
	interval: number;
	spinner: ReturnType<typeof p.spinner>;
}

interface TokenResponse {
	access_token: string;
	token_type?: string;
	scope?: string;
}

async function pollForToken({
	deviceCode,
	interval,
	spinner,
}: PollOptions): Promise<TokenResponse | null> {
	let pollingInterval = interval;
	const maxAttempts = 120;
	let attempts = 0;

	while (attempts < maxAttempts) {
		attempts++;

		await sleep(pollingInterval * 1000);

		try {
			const { data, error } = await authClient.device.token({
				grant_type: "urn:ietf:params:oauth:grant-type:device_code",
				device_code: deviceCode,
				client_id: "better-auth-cli",
			});

			if (data?.access_token) {
				return {
					access_token: data.access_token,
					token_type: data.token_type,
					scope: data.scope,
				};
			}

			if (error) {
				switch (error.error) {
					case "authorization_pending":
						break;
					case "slow_down":
						pollingInterval += 5;
						spinner.message(
							`Waiting for authorization... (polling every ${pollingInterval}s)`,
						);
						break;
					case "access_denied":
						spinner.stop("Access denied");
						p.log.error("Authorization was denied by the user");
						process.exit(1);
						break;
					case "expired_token":
						spinner.stop("Code expired");
						p.log.error(
							"The device code has expired. Please run login again to get a new code.",
						);
						process.exit(1);
						break;
					default:
						spinner.stop("Error");
						p.log.error(
							error.error_description || error.error || "Unknown error",
						);
						process.exit(1);
				}
			}
		} catch {
			// Network error, continue polling
		}
	}

	spinner.stop("Timeout");
	p.log.error("Authorization timed out. Please try again.");
	process.exit(1);
}
