import { execSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import type { Agent } from "node:https";
import { rootCertificates } from "node:tls";
import { confirm, isCancel, outro, spinner, text } from "@clack/prompts";
import chalk from "chalk";
import { Command } from "commander";
import open from "open";
import { WebSocket } from "ws";
import * as z from "zod";
import { cliVersion } from "../..";
import { getInfraBaseURL } from "../../utils/helper";
import type { StoredToken } from "../../utils/storage";
import {
	getStoredToken,
	isStudioKeyExpired,
	setStoredStudioKey,
	setStudioKeyRotation,
} from "../../utils/storage";
import { handleLogin } from "../login";
import type { RequestContext } from "./client";
import { runTunnel } from "./client";
import type { TunnelEvent } from "./schemas";

const TUNNEL_BASE_URL = new URL("https://tunnel.better-auth.com");
const HEARTBEAT_INTERVAL = 25_000;

const studioOptionsSchema = z.object({
	port: z.coerce.number().int().min(1).max(65535).optional(),
	yes: z.boolean().default(false),
	expiry: z.coerce.number().int().min(0).nullable().optional(),
	rotateKey: z.boolean().default(false),
});

async function ensureAuthenticated(yes: boolean) {
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
	return token;
}

async function resolveApiKey(
	token: StoredToken,
	expiry: number | null | undefined,
	rotateKey: boolean,
): Promise<{ apiKey: string; keyWasRotated: boolean; token: StoredToken }> {
	let currentToken = token;
	if (expiry !== undefined) {
		await setStudioKeyRotation(expiry ?? null);
		const next = await getStoredToken();
		if (!next) {
			outro(
				"❌ Failed to save settings. Check write access to your config directory.",
			);
			process.exit(1);
		}
		currentToken = next;
	}

	let apiKey = currentToken.studio_api_key ?? null;
	const keyWasRotated =
		rotateKey || (apiKey !== null && isStudioKeyExpired(currentToken));
	if (keyWasRotated) apiKey = null;
	if (!apiKey) {
		apiKey = `ba_studio_${randomUUID().replace(/-/g, "")}`;
		await setStoredStudioKey(
			apiKey,
			currentToken.studio_key_rotation_days ?? null,
		);
		const next = await getStoredToken();
		if (!next) {
			outro(
				"❌ Failed to store studio API key. Check write access to your config directory.",
			);
			process.exit(1);
		}
		currentToken = next;
	}
	return { apiKey, keyWasRotated, token: currentToken };
}

async function getBasePath(yes: boolean): Promise<string> {
	if (yes) return "/api/auth";
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
	return customBasePath;
}

function createShutdownHandler(
	ws: WebSocket,
	token: StoredToken,
	getTunnelId: () => string | null,
) {
	let shuttingDown = false;
	let forceExit = false;
	return async function shutdown(exitCode = 0) {
		if (shuttingDown) {
			if (forceExit) process.exit(exitCode);
			forceExit = true;
			return;
		}
		shuttingDown = true;
		console.log(chalk.dim("\n  Disconnecting..."));
		const tunnelId = getTunnelId();
		if (tunnelId) {
			try {
				await fetch(`${getInfraBaseURL()}/api/studio/cleanup`, {
					method: "POST",
					headers: {
						"Content-Type": "application/json",
						Authorization: `Bearer ${token.access_token}`,
					},
					body: JSON.stringify({ tunnelId }),
				});
			} catch {
				//
			}
		}
		if (ws.readyState === WebSocket.OPEN) {
			ws.close(1000, "client disconnect");
		}
		process.exit(exitCode);
	};
}

const createRequestLogger =
	(basePath: string) =>
	(event: TunnelEvent<"response">, ctx: RequestContext) => {
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
	};

function setupWSHandlers(
	ws: WebSocket,
	s: ReturnType<typeof spinner>,
	heartbeat: ReturnType<typeof setInterval>,
) {
	ws.on("open", () => {
		s.stop(chalk.green("Connected."));
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
}

async function studioAction(arg0: unknown, opts: Record<string, unknown>) {
	const parsed = studioOptionsSchema.parse({ port: arg0, ...opts });
	const port = parsed.port ?? 3000;
	const token = await ensureAuthenticated(parsed.yes);
	const {
		apiKey,
		keyWasRotated,
		token: currentToken,
	} = await resolveApiKey(token, parsed.expiry, parsed.rotateKey);
	const basePath = await getBasePath(parsed.yes);

	const to = `http://localhost:${port}`;
	const { wsUrl, headers } = buildConnectOptions(
		TUNNEL_BASE_URL,
		currentToken.access_token,
	);

	const s1 = spinner();
	s1.start("Connecting...");
	const tlsAgent = await getMkcertAgent(wsUrl);
	const ws = new WebSocket(wsUrl, {
		headers,
		...(tlsAgent ? { agent: tlsAgent } : {}),
	});

	let tunnelId: string | null = null;
	const shutdown = createShutdownHandler(ws, currentToken, () => tunnelId);

	const heartbeat = setInterval(() => {
		if (ws.readyState !== WebSocket.OPEN) return;
		ws.send(JSON.stringify({ type: "ping" }));
	}, HEARTBEAT_INTERVAL);

	process.on("SIGINT", () => shutdown());
	process.on("SIGTERM", () => shutdown());

	setupWSHandlers(ws, s1, heartbeat);

	await runTunnel(ws, {
		to,
		async onReady(event) {
			if (process.stdin.isTTY) {
				process.stdin.setRawMode(true);
				process.stdin.resume();
				process.stdin.on("data", async (key) => {
					if (key[0] === 0x03) await shutdown();
				});
			}
			tunnelId = event.id;
			const baseUrl = getInfraBaseURL();
			const connectRes = await fetch(`${baseUrl}/api/studio/connect`, {
				method: "POST",
				headers: {
					"Content-Type": "application/json",
					Authorization: `Bearer ${currentToken.access_token}`,
				},
				body: JSON.stringify({
					tunnelId: event.id,
					basePath,
					apiKey,
				}),
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
				await shutdown(1);
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
					`   ██  ████  ${chalk.gray(`v${cliVersion}`)}`,
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
		onResponse: createRequestLogger(basePath),
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

function buildConnectOptions(baseUrl: URL, token: string) {
	const wsUrl = new URL(baseUrl);
	wsUrl.protocol = wsUrl.protocol === "https:" ? "wss:" : "ws:";
	wsUrl.pathname = "/connect";
	return {
		wsUrl: wsUrl.toString(),
		headers: { Authorization: `Bearer ${token}` },
	};
}

async function getMkcertAgent(wsUrl: string): Promise<Agent | null> {
	if (process.env.NODE_ENV !== "development") return null;
	if (!wsUrl.startsWith("wss://")) return null;

	const https = await import("node:https");
	const rawCaPath = process.env.NODE_EXTRA_CA_CERTS || getMkcertCaPath();
	const caPath = rawCaPath?.replace(/^['"]|['"]$/g, "").trim();
	if (!caPath) return null;

	try {
		const customCa = readFileSync(caPath, "utf-8");
		const ca = [...rootCertificates, customCa];
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
