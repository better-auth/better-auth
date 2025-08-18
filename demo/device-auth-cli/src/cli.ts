#!/usr/bin/env node
import meow from "meow";
import open from "open";
import { createAuthClient } from "better-auth/client";
import { deviceAuthorizationClient } from "better-auth/client/plugins";

const cli = meow(
	`
	Usage
	  $ device-authorization-cli-new

	Options
	  --server-url  The Better Auth server URL (default: http://localhost:3000)
	  --client-id   The OAuth client ID (default: demo-cli)

	Examples
	  $ device-authorization-cli-new
	  $ device-authorization-cli-new --server-url https://auth.example.com
`,
	{
		importMeta: import.meta,
		flags: {
			serverUrl: {
				type: "string",
				default: "http://localhost:3000",
			},
			clientId: {
				type: "string",
				default: "demo-cli",
			},
		},
	},
);

const { serverUrl, clientId } = cli.flags;

// Create the better-auth client
const authClient = createAuthClient({
	baseURL: serverUrl,
	plugins: [deviceAuthorizationClient()],
});

async function startDeviceFlow() {
	console.log("🔐 Better Auth Device Authorization Demo");
	console.log(`Server: ${serverUrl}`);
	console.log(`Client ID: ${clientId}`);
	console.log("");
	console.log("⏳ Requesting device authorization...");

	try {
		const { data, error } = await authClient.device.code({
			client_id: clientId,
			scope: "openid profile email",
		});

		if (error) {
			console.error(
				"❌ Error:",
				error.message || "Failed to request device code",
			);
			process.exit(1);
		}

		if (!data) {
			console.error("❌ Error: No data received from server");
			process.exit(1);
		}

		const {
			device_code,
			user_code,
			verification_uri,
			verification_uri_complete,
			interval = 5,
		} = data;

		console.log("");
		console.log("📱 Device Authorization in Progress");
		console.log(`Please visit: ${verification_uri}`);
		console.log(`Enter code: ${user_code}`);
		console.log("");

		const urlToOpen = verification_uri_complete || verification_uri;
		if (urlToOpen) {
			console.log("🌐 Opening browser...");
			await open(urlToOpen);
		}

		console.log(`⏳ Waiting for authorization... (polling every ${interval}s)`);

		await pollForToken(device_code, interval);
	} catch (err) {
		console.error(
			"❌ Error:",
			err instanceof Error ? err.message : "Unknown error",
		);
		process.exit(1);
	}
}

async function pollForToken(deviceCode: string, interval: number) {
	let pollingInterval = interval;

	return new Promise<void>((resolve) => {
		const poll = async () => {
			try {
				const { data, error } = await authClient.device.token({
					grant_type: "urn:ietf:params:oauth:grant-type:device_code",
					device_code: deviceCode,
					client_id: clientId,
				});

				if (data?.access_token) {
					console.log("");
					console.log("✅ Authorization Successful!");
					console.log("Access token received!");
					console.log(`Token: ${data.access_token.substring(0, 20)}...`);
					resolve();
					process.exit(0);
				} else if (error) {
					const code = error.code ? error.code : "unknown_error";

					switch (code) {
						case "authorization_pending":
							// Continue polling
							break;
						case "slow_down":
							pollingInterval += 5;
							console.log(`⚠️  Slowing down polling to ${pollingInterval}s`);
							break;
						case "access_denied":
							console.error("❌ Access was denied by the user");
							resolve();
							process.exit(1);
							break;
						case "expired_token":
							console.error(
								"❌ The device code has expired. Please try again.",
							);
							resolve();
							process.exit(1);
							break;
						default:
							console.error(
								"❌ Error:",
								error.message || "Unknown error during polling",
							);
							resolve();
							process.exit(1);
					}
				}
			} catch (err) {
				console.error(
					"❌ Network error:",
					err instanceof Error ? err.message : "Unknown error",
				);
				resolve();
				process.exit(1);
			}

			setTimeout(poll, pollingInterval * 1000);
		};

		setTimeout(poll, pollingInterval * 1000);
	});
}

startDeviceFlow().catch((err) => {
	console.error("❌ Fatal error:", err);
	process.exit(1);
});
