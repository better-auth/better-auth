import type { InferOptionSchema } from "../../types";
import type { agentSchema } from "./schema";

export interface AgentAuthOptions {
	/**
	 * Role definitions mapping role names to scope arrays.
	 *
	 * @example
	 * ```ts
	 * roles: {
	 *   agent: ["email.send", "reports.read"],
	 *   finance_agent: ["email.send", "invoices.read"],
	 * }
	 * ```
	 */
	roles?: Record<string, string[]>;
	/**
	 * Default role assigned to new agents.
	 */
	defaultRole?: string;
	/**
	 * Allowed key algorithms for keypair.
	 * @default ["Ed25519"]
	 */
	allowedKeyAlgorithms?: string[];
	/**
	 * JWT claim format for keypair auth.
	 *
	 * - `"simple"` — flat claims: `sub`, `scopes`, `userId`, `role`
	 * - `"aap"` — structured AAP-compatible claims: `aap_agent`, `aap_capabilities`, etc.
	 *
	 * @default "simple"
	 */
	jwtFormat?: "simple" | "aap";
	/**
	 * Maximum age for agent JWTs in seconds.
	 * @default 60
	 */
	jwtMaxAge?: number;
	/**
	 * Sliding TTL for agent sessions in seconds. When set, agents
	 * automatically expire if unused for longer than this duration.
	 * Each authenticated request extends the deadline.
	 *
	 * Set to `0` or omit to disable TTL (agents never auto-expire).
	 * @default 3600 (1 hour)
	 */
	agentSessionTTL?: number;
	/**
	 * MCP providers that agents can connect to through the gateway.
	 *
	 * Pass a string for known providers (e.g. "github", "slack"),
	 * or a config object for custom MCP servers.
	 *
	 * @example
	 * ```ts
	 * mcpProviders: [
	 *   "github",
	 *   "slack",
	 *   { name: "my-tool", command: "node", args: ["my-server.js"] },
	 * ]
	 * ```
	 */
	mcpProviders?: (string | MCPProviderConfig)[];
	/**
	 * Custom schema overrides for the agent table.
	 */
	schema?: InferOptionSchema<ReturnType<typeof agentSchema>>;
}

/**
 * An agent record as stored in the database.
 */
export interface Agent {
	id: string;
	name: string;
	userId: string;
	orgId: string | null;
	scopes: string[];
	role: string | null;
	status: "active" | "revoked";
	publicKey: string;
	kid: string | null;
	lastUsedAt: Date | null;
	expiresAt: Date | null;
	metadata: Record<string, unknown> | null;
	createdAt: Date;
	updatedAt: Date;
}

/**
 * The session object returned when an agent authenticates.
 * Available via `ctx.context.agentSession` in route handlers.
 */
export interface AgentSession {
	agent: {
		id: string;
		name: string;
		scopes: string[];
		role: string | null;
		orgId: string | null;
		createdAt: Date;
		metadata: Record<string, unknown> | null;
	};
	user: {
		id: string;
		name: string;
		email: string;
		[key: string]: unknown;
	};
}

/**
 * Configuration for an MCP provider.
 *
 * Mirrors the MCP server config format you already know from
 * Cursor / Claude Desktop, plus a `name` for scope namespacing.
 *
 * @example Stdio provider (spawns a process)
 * ```ts
 * { name: "github", command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] }
 * ```
 *
 * @example SSE provider (connects to a remote URL)
 * ```ts
 * { name: "my-api", url: "https://mcp.example.com/sse" }
 * ```
 */
export interface MCPProviderConfig {
	/** Unique name used as scope namespace (e.g. "github", "slack"). */
	name: string;
	/** Human-readable label. Defaults to `name` if omitted. */
	displayName?: string;
	/** Transport type. Auto-detected: "stdio" if `command` is set, "sse" if `url` is set. */
	transport?: "stdio" | "sse";
	/** Command to spawn the MCP server (e.g. "npx", "node"). */
	command?: string;
	/** Arguments for the command (e.g. ["-y", "@modelcontextprotocol/server-github"]). */
	args?: string[];
	/** Extra environment variables for the spawned process. Merged with the parent env. */
	env?: Record<string, string>;
	/** URL for remote MCP servers using SSE transport. */
	url?: string;
	/** HTTP headers for SSE connections (e.g. authorization). */
	headers?: Record<string, string>;
	/**
	 * Optional scope-to-tools mapping for granular access control.
	 *
	 * @example
	 * ```ts
	 * toolScopes: {
	 *   read: ["list_files", "read_file"],
	 *   write: ["create_file", "update_file"],
	 * }
	 * ```
	 *
	 * When omitted, all tools are accessible under `{provider}.*`.
	 */
	toolScopes?: Record<string, string[]>;
}

/**
 * An MCP provider record as stored in the database.
 */
export interface MCPProvider {
	id: string;
	name: string;
	displayName: string;
	transport: "stdio" | "sse";
	command: string | null;
	args: string[];
	env: Record<string, string> | null;
	url: string | null;
	headers: Record<string, string> | null;
	toolScopes: Record<string, string[]> | null;
	status: "active" | "disabled";
	createdAt: Date;
	updatedAt: Date;
}

/**
 * Resolved options with defaults applied.
 */
export type ResolvedAgentAuthOptions = Required<
	Pick<
		AgentAuthOptions,
		"allowedKeyAlgorithms" | "jwtFormat" | "jwtMaxAge" | "agentSessionTTL"
	>
> &
	AgentAuthOptions;
