import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Agent } from "node:https";
import { confirm, isCancel, outro, spinner, text } from "@clack/prompts";
import chalk from "chalk";
import { Command } from "commander";
import open from "open";
import { WebSocket } from "ws";
import * as z from "zod";
import { getInfraBaseURL } from "../../utils/helper";
import {
	getStoredToken,
	isStudioKeyExpired,
	setStoredStudioKey,
	setStudioKeyRotation,
} from "../../utils/storage";
import { handleLogin } from "../login";
import { runTunnel } from "./client";

const TUNNEL_BASE_URL = "https://tunnel.better-auth.com";
const HEARTBEAT_INTERVAL = 25_000;

async function studioAction(arg0: unknown, opts: Record<string, unknown>) {
	const {
		port = 3000,
		yes,
		expiry,
		rotateKey,
	} = z
		.object({
			port: z.coerce.number().int().min(1).max(65535).optional(),
			yes: z.boolean().default(false),
			expiry: z.coerce.number().int().min(0).nullable().optional(),
			rotateKey: z.boolean().default(false),
		})
		.parse({ port: arg0, ...opts });

	let token = await getStoredToken();
	if (!token) {
		if (!yes) {
			const shouldLogin = await confirm({
				message: "You are not logged in. Do you want to login?",
				initialValue: true,
			});
			if (isCancel(shouldLogin) || !shouldLogin) {
				outro("❌ Operation cancelled.");
				process.exit(1);
			}
		}
		await handleLogin();
		token = await getStoredToken();
	}

	if (!token) {
		outro("❌ You are not logged in. Please login to continue.");
		process.exit(1);
	}

	if (expiry !== undefined) {
		await setStudioKeyRotation(expiry ?? null);
		token = await getStoredToken();
	}

	let apiKey = token?.studio_api_key ?? null;
	const keyWasRotated =
		rotateKey || (apiKey !== null && isStudioKeyExpired(token!));
	if (keyWasRotated) {
		apiKey = null;
	}
	if (!apiKey) {
		apiKey = `ba_studio_${randomUUID().replace(/-/g, "")}`;
		await setStoredStudioKey(apiKey, token?.studio_key_rotation_days ?? null);
		token = await getStoredToken();
	}

	let basePath = "/api/auth";
	if (!yes) {
		const customBasePath = await text({
			message: "Enter your base path (or press Enter to use the default)",
			defaultValue: "/api/auth",
			placeholder: "/api/auth",
			validate(value) {
				if (value && !value.startsWith("/")) {
					return "Base path must start with a slash";
				}
			},
		});
		if (isCancel(customBasePath) || !customBasePath) {
			outro("❌ Operation cancelled.");
			process.exit(1);
		}
		basePath = customBasePath;
	}

	const to = `http://localhost:${port}`;
	const { wsUrl, headers } = buildConnectOptions(
		TUNNEL_BASE_URL,
		token!.access_token,
	);

	const s1 = spinner();
	s1.start("Connecting...");
	const tlsAgent = await getMkcertAgent(wsUrl);
	const ws = new WebSocket(wsUrl, {
		headers,
		...(tlsAgent ? { agent: tlsAgent } : {}),
	});

	let tunnelId: string | null = null;

	const cleanup = async () => {
		if (!tunnelId) return;
		try {
			await fetch(`${getInfraBaseURL()}/api/studio/cleanup`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token!.access_token}`,
				},
				body: JSON.stringify({ tunnelId }),
			});
		} catch {
			//
		}
	};

	let shuttingDown = false;
	let forceExit = false;
	const shutdown = async () => {
		if (shuttingDown) {
			if (forceExit) process.exit(0);
			forceExit = true;
			return;
		}
		shuttingDown = true;
		console.log(chalk.dim("\n  Disconnecting..."));
		await cleanup();
		if (ws.readyState === WebSocket.OPEN) {
			ws.close(1000, "client disconnect");
		}
		process.exit(0);
	};

	const heartbeat = setInterval(() => {
		if (ws.readyState !== WebSocket.OPEN) return;
		ws.send(JSON.stringify({ type: "ping" }));
	}, HEARTBEAT_INTERVAL);

	process.on("SIGINT", () => shutdown());
	process.on("SIGTERM", () => shutdown());

	await runTunnel(ws, {
		to,
		async onReady(event) {
			// Handle Ctrl+C
			if (process.stdin.isTTY) {
				process.stdin.setRawMode(true);
				process.stdin.resume();
				process.stdin.on("data", async (key) => {
					if (key[0] === 0x03) {
						await shutdown();
					}
				});
			}

			tunnelId = event.id;
			const baseUrl = getInfraBaseURL();

			const connectRes = await fetch(`${baseUrl}/api/studio/connect`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${token!.access_token}`,
				},
				body: JSON.stringify({ tunnelId, basePath, apiKey }),
			});

			if (!connectRes.ok) {
				const msg = (await connectRes.text()) || connectRes.statusText;
				console.error(chalk.red("  Failed to connect Studio."));
				console.error(chalk.dim(`  ${connectRes.status} ${msg}`));
				console.error(
					chalk.yellow(
						"\n  Make sure you're signed in with the same account as the Dashboard.\n",
					),
				);
				return;
			}

			const payload = (await connectRes.json()) as {
				data: { id: string; slug: string };
			};
			const dashboardUrl = `${baseUrl}/${payload.data.slug}`;

			console.log();
			console.log(
				[
					`   ██  ████`,
					`   ████  ██  ${chalk.bold("Better Auth Studio")}`,
					`   ██  ████  ${chalk.gray("Beta")}`,
				].join("\n"),
			);
			console.log();
			if (keyWasRotated) {
				console.log(
					chalk.yellow(
						`  Key rotated — restart your dev server if not done already.`,
					),
				);
				console.log();
			}
			console.log(
				`  ${chalk.dim("-")} ${chalk.bold("Dashboard")}  ${chalk.cyan(dashboardUrl)}`,
			);
			console.log(
				`  ${chalk.dim("-")} ${chalk.bold("Base URL")}   ${chalk.dim(to)}`,
			);
			if (basePath !== "/api/auth") {
				console.log(
					`  ${chalk.dim("-")} ${chalk.bold("Base Path")}  ${chalk.dim(basePath)}`,
				);
			}
			console.log();
			console.log(chalk.dim(`  Press ${chalk.bold("Ctrl+C")} to stop.\n`));

			open(dashboardUrl).catch(() => {
				console.log(chalk.dim("  Could not open browser automatically."));
			});
		},
		onResponse(event, ctx) {
			const statusColor =
				event.status < 300
					? chalk.green
					: event.status < 400
						? chalk.yellow
						: chalk.red;

			const method = chalk.dim(ctx.method.padEnd(5));
			const status = statusColor(String(event.status).padStart(3));
			const path = (event.path.replace(basePath, "") || "/").padEnd(28);
			const duration = ctx.duration
				? chalk.dim(String(ctx.duration).padStart(4) + "ms")
				: "";

			console.log(`  ${method} ${status}  ${path}  ${duration}`);
		},
	});

	ws.on("open", () => {
		s1.stop(chalk.green("Connected."));
	});

	ws.on("error", (err) => {
		console.error(chalk.red(`  Connection error: ${err.message}`));
		clearInterval(heartbeat);
		process.exit(1);
	});

	ws.on("close", (code, reason) => {
		clearInterval(heartbeat);
		if (code !== 1000) {
			console.log(
				chalk.dim(`  Tunnel closed (${code}${reason ? `: ${reason}` : ""})`),
			);
			process.exit(1);
		}
		process.exit(0);
	});

	await new Promise<void>((resolve) => {
		ws.on("close", () => resolve());
		ws.on("error", () => resolve());
	});
}

export const studio = new Command("studio")
	.description("Start Better Auth Studio")
	.argument("[port]", "The port of your local server", 3000)
	.option("-y, --yes", "Skip all optional prompts and use defaults", false)
	.option(
		"--expiry <days>",
		"Auto-rotate the studio API key every N days (0 = never).",
	)
	.option("--rotate-key", "Forces a key rotation immediately.", false)
	.action(studioAction);

function buildConnectOptions(baseUrl: string, token: string) {
	const wsUrl = new URL(baseUrl);
	wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
	wsUrl.pathname = "/connect";
	return {
		wsUrl: wsUrl.toString(),
		headers: { Authorization: `Bearer ${token}` },
	};
}

async function getMkcertAgent(wsUrl: string): Promise<Agent | null> {
	if (!wsUrl.startsWith("wss://")) return null;

	const https = await import("node:https");
	const rawCaPath = process.env.NODE_EXTRA_CA_CERTS || getMkcertCaPath();
	const caPath = rawCaPath?.replace(/^['"]|['"]$/g, "").trim();
	if (!caPath) return null;

	try {
		const ca = readFileSync(caPath);
		return new https.Agent({ ca });
	} catch {
		return null;
	}
}

function getMkcertCaPath(): string | null {
	try {
		const caRoot = execSync("mkcert -CAROOT", { encoding: "utf-8" }).trim();
		if (!caRoot) return null;
		return `${caRoot}/rootCA.pem`;
	} catch {
		return null;
	}
}
