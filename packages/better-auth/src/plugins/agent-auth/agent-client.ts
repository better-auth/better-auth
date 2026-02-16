import { generateAgentKeypair, signAgentJWT } from "./crypto";
import type { AgentSession } from "./types";

export { generateAgentKeypair as generateKeypair } from "./crypto";

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
		async fetch(
			path: string,
			init?: RequestInit,
		): Promise<Response> {
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
			const res = await globalThis.fetch(
				`${base}/api/auth/agent/get-session`,
				{
					headers: { Authorization: auth },
				},
			);
			if (!res.ok) return null;
			return res.json();
		},

		/** The base URL this client is configured for */
		baseURL: base,

		/** The agent ID this client authenticates as */
		agentId,
	};
}
