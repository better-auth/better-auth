import { generateAgentKeypair, signAgentJWT } from "./crypto";
import type { AgentSession } from "./types";

export { generateAgentKeypair as generateKeypair } from "./crypto";

/**
 * Open a URL in the user's default browser.
 * Works cross-platform (macOS, Linux, Windows).
 */
async function openInBrowser(url: string): Promise<void> {
	const { exec } = await import("node:child_process");
	const { platform } = await import("node:os");
	const cmd =
		platform() === "darwin"
			? "open"
			: platform() === "win32"
				? "start"
				: "xdg-open";
	exec(`${cmd} "${url}"`);
}

// =========================================================================
// DEVICE AUTH CONNECT FLOW
// =========================================================================

export interface ConnectAgentOptions {
	/** Base URL of the app (e.g. "https://app-x.com") */
	appURL: string;
	/** Agent name. Default: "Agent" */
	name?: string;
	/** Scopes to request. */
	scopes?: string[];
	/** Role to request. */
	role?: string;
	/** Pre-generated keypair. If not provided, one will be generated. */
	keypair?: {
		publicKey: Record<string, unknown>;
		privateKey: Record<string, unknown>;
		kid: string;
	};
	/** Client ID for the device auth flow. Default: "agent-auth" */
	clientId?: string;
	/** Polling interval in ms. Default: 5000 */
	pollInterval?: number;
	/** Max wait time in ms before giving up. Default: 300000 (5 min) */
	timeout?: number;
	/**
	 * Called when the user code is ready.
	 * Show this to the user so they can approve in their browser.
	 */
	onUserCode?: (info: {
		userCode: string;
		verificationUri: string;
		verificationUriComplete: string;
		expiresIn: number;
	}) => void;
	/**
	 * Called on each poll attempt.
	 * Useful for showing a spinner or progress indicator.
	 */
	onPoll?: (attempt: number) => void;
	/**
	 * Automatically open the verification URL in the user's default browser.
	 * Uses the `verification_uri_complete` (with user code pre-filled).
	 * Default: false
	 */
	openBrowser?: boolean;
}

export interface ConnectAgentResult {
	agentId: string;
	name: string;
	scopes: string[];
	publicKey: Record<string, unknown>;
	privateKey: Record<string, unknown>;
	kid: string;
}

/**
 * Connect an agent to an app using the device authorization flow.
 *
 * 1. Generates a keypair (or uses the provided one)
 * 2. Requests a device code from the app
 * 3. Calls onUserCode so you can show the code to the user
 * 4. Polls until the user approves (or times out)
 * 5. Uses the session token to register the agent's public key
 * 6. Returns the agent ID, keypair, and scopes
 *
 * The app must have both `agentAuth()` and `deviceAuthorization()` plugins enabled.
 *
 * @example
 * ```ts
 * const result = await connectAgent({
 *   appURL: "https://myapp.com",
 *   name: "My Agent",
 *   scopes: ["reports.read"],
 *   onUserCode: ({ userCode, verificationUri }) => {
 *     console.log(`Go to ${verificationUri} and enter: ${userCode}`);
 *   },
 * });
 * // result.agentId, result.privateKey, result.publicKey
 * ```
 */
export async function connectAgent(
	options: ConnectAgentOptions,
): Promise<ConnectAgentResult> {
	const {
		appURL,
		name = "Agent",
		scopes = [],
		role,
		clientId = "agent-auth",
		pollInterval = 5000,
		timeout = 300_000,
		onUserCode,
		onPoll,
		openBrowser = false,
	} = options;

	const base = appURL.replace(/\/+$/, "");

	// Step 1: Generate or reuse keypair
	const keypair = options.keypair ?? (await generateAgentKeypair());

	// Step 2: Request a device code
	const codeRes = await globalThis.fetch(`${base}/api/auth/device/code`, {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({
			client_id: clientId,
			scope: scopes.join(" "),
		}),
	});

	if (!codeRes.ok) {
		const err = await codeRes.text();
		throw new Error(`Failed to request device code: ${err}`);
	}

	const codeData = (await codeRes.json()) as {
		device_code: string;
		user_code: string;
		verification_uri: string;
		verification_uri_complete: string;
		expires_in: number;
		interval: number;
	};

	// Step 3: Notify caller to show the code
	if (onUserCode) {
		onUserCode({
			userCode: codeData.user_code,
			verificationUri: codeData.verification_uri,
			verificationUriComplete: codeData.verification_uri_complete,
			expiresIn: codeData.expires_in,
		});
	}

	// Step 3b: Auto-open browser if requested
	if (openBrowser) {
		openInBrowser(codeData.verification_uri_complete).catch(() => {});
	}

	// Step 4: Poll for approval
	const effectiveInterval = Math.max(pollInterval, codeData.interval * 1000);
	const deadline = Date.now() + timeout;
	let attempt = 0;
	let accessToken: string | null = null;

	while (Date.now() < deadline) {
		await new Promise((resolve) => setTimeout(resolve, effectiveInterval));
		attempt++;
		if (onPoll) onPoll(attempt);

		const tokenRes = await globalThis.fetch(`${base}/api/auth/device/token`, {
			method: "POST",
			headers: { "Content-Type": "application/json" },
			body: JSON.stringify({
				grant_type: "urn:ietf:params:oauth:grant-type:device_code",
				device_code: codeData.device_code,
				client_id: clientId,
			}),
		});

		if (tokenRes.ok) {
			const tokenData = (await tokenRes.json()) as {
				access_token: string;
			};
			accessToken = tokenData.access_token;
			break;
		}

		const errorData = (await tokenRes.json()) as {
			error: string;
			error_description?: string;
		};

		if (errorData.error === "authorization_pending") {
			continue;
		}
		if (errorData.error === "slow_down") {
			// Back off by adding the interval
			await new Promise((resolve) => setTimeout(resolve, effectiveInterval));
			continue;
		}
		if (errorData.error === "access_denied") {
			throw new Error("User denied the agent connection.");
		}
		if (errorData.error === "expired_token") {
			throw new Error("Device code expired. Please try again.");
		}

		throw new Error(
			`Device auth failed: ${errorData.error} — ${errorData.error_description ?? ""}`,
		);
	}

	if (!accessToken) {
		throw new Error("Timed out waiting for user approval.");
	}

	// Step 5: Register the agent with the app using the session token
	// Send as cookie — Better Auth's getSessionFromCtx reads session from cookies, not Authorization header
	const createRes = await globalThis.fetch(`${base}/api/auth/agent/create`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
			Cookie: `better-auth.session_token=${accessToken}`,
		},
		body: JSON.stringify({
			name,
			publicKey: keypair.publicKey,
			scopes,
			role,
		}),
	});

	if (!createRes.ok) {
		const err = await createRes.text();
		throw new Error(`Failed to register agent: ${err}`);
	}

	const createData = (await createRes.json()) as {
		agentId: string;
		name: string;
		scopes: string[];
	};

	return {
		agentId: createData.agentId,
		name: createData.name,
		scopes: createData.scopes,
		publicKey: keypair.publicKey,
		privateKey: keypair.privateKey,
		kid: keypair.kid,
	};
}

export interface AgentClientOptions {
	/** Base URL of the app (e.g. "https://app-x.com") */
	baseURL: string;
	/** The agent's ID (returned from /agent/create) */
	agentId: string;
	/** The agent's Ed25519 private key as JWK */
	privateKey: Record<string, unknown>;
	/** JWT expiration in seconds. Default: 60 */
	jwtExpiresIn?: number;
	/** JWT claim format. Default: "simple" */
	jwtFormat?: "simple" | "aap";
}

/**
 * Create an authenticated client for an agent runtime.
 *
 * Signs a fresh JWT for every request using the agent's private key.
 * The JWT is short-lived (default 60s) and includes the agent's ID as `sub`.
 *
 * @example
 * ```ts
 * import { createAgentClient, generateKeypair } from "better-auth/plugins/agent-auth/agent-client";
 *
 * const { privateKey, publicKey } = await generateKeypair();
 * // Register publicKey with the app via /agent/create, get back agentId
 *
 * const agent = createAgentClient({
 *   baseURL: "https://app-x.com",
 *   agentId: "agt_abc",
 *   privateKey,
 * });
 *
 * const response = await agent.fetch("/api/reports/Q4");
 * const session = await agent.getSession();
 * ```
 */
export function createAgentClient(options: AgentClientOptions) {
	const {
		baseURL,
		agentId,
		privateKey,
		jwtExpiresIn = 60,
		jwtFormat = "simple",
	} = options;

	const base = baseURL.replace(/\/+$/, "");

	async function getAuthHeader(): Promise<string> {
		const jwt = await signAgentJWT({
			agentId,
			privateKey,
			expiresIn: jwtExpiresIn,
			format: jwtFormat,
		});
		return `Bearer ${jwt}`;
	}

	return {
		/**
		 * Make an authenticated fetch to the app.
		 * Automatically signs a fresh JWT and attaches it as a Bearer token.
		 */
		async fetch(path: string, init?: RequestInit): Promise<Response> {
			const url = path.startsWith("http") ? path : `${base}${path}`;
			const auth = await getAuthHeader();
			return globalThis.fetch(url, {
				...init,
				headers: {
					...init?.headers,
					Authorization: auth,
				},
			});
		},

		/**
		 * Resolve the agent's own session by calling GET /api/auth/agent/get-session.
		 * Returns the agent session or null if auth fails.
		 */
		async getSession(): Promise<AgentSession | null> {
			const auth = await getAuthHeader();
			const res = await globalThis.fetch(`${base}/api/auth/agent/get-session`, {
				headers: { Authorization: auth },
			});
			if (!res.ok) return null;
			return res.json();
		},

		/** The base URL this client is configured for */
		baseURL: base,

		/** The agent ID this client authenticates as */
		agentId,
	};
}
