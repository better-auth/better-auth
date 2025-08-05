#!/usr/bin/env node
import meow from "meow";
import open from "open";

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

async function startDeviceFlow() {
	console.log("🔐 Better Auth Device Authorization Demo");
	console.log(`Server: ${serverUrl}`);
	console.log(`Client ID: ${clientId}`);
	console.log("");
	console.log("⏳ Requesting device authorization...");

	const response = await fetch(`${serverUrl}/api/auth/device/code`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify({
			client_id: clientId,
			scope: "openid profile email",
		}),
	});

	if (!response.ok) {
		console.error("❌ Error:", `HTTP error! status: ${response.status}`);
		process.exit(1);
	}

	const data = await response.json();
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

	pollForToken(device_code, interval);
}

async function pollForToken(deviceCode: string, interval: number) {
	let pollingInterval = interval;

	const poll = async () => {
		try {
			const response = await fetch(`${serverUrl}/api/auth/device/token`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
				},
				body: JSON.stringify({
					grant_type: "urn:ietf:params:oauth:grant-type:device_code",
					device_code: deviceCode,
					client_id: clientId,
				}),
			});

			const data = await response.json();

			if (response.ok && data.access_token) {
				console.log("");
				console.log("✅ Authorization Successful!");
				console.log("Access token received!");
				console.log(`Token: ${data.access_token.substring(0, 20)}...`);
				process.exit(0);
			} else if (data.error) {
				switch (data.error) {
					case "authorization_pending":
						break;
					case "slow_down":
						pollingInterval += 5;
						console.log(`⚠️  Slowing down polling to ${pollingInterval}s`);
						break;
					case "access_denied":
						console.error("❌ Access was denied by the user");
						process.exit(1);
					case "expired_token":
						console.error("❌ The device code has expired. Please try again.");
						process.exit(1);
					default:
						console.error(
							"❌ Error:",
							data.error_description || "Unknown error during polling",
						);
						process.exit(1);
				}
			}
		} catch (err) {
			console.error(
				"❌ Network error:",
				err instanceof Error ? err.message : "Unknown error",
			);
			process.exit(1);
		}

		setTimeout(poll, pollingInterval * 1000);
	};

	setTimeout(poll, pollingInterval * 1000);
}

startDeviceFlow();
