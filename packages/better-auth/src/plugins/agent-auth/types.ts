import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";
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
	 * Which auth methods are allowed. Default: both.
	 * @default ["token", "keypair"]
	 */
	allowedAuthMethods?: ("token" | "keypair")[];
	/**
	 * Prefix for generated agent tokens.
	 * @default "ba_agt_"
	 */
	tokenPrefix?: string;
	/**
	 * Length of the random part of the token (excludes prefix).
	 * @default 48
	 */
	tokenLength?: number;
	/**
	 * Allowed key algorithms for keypair method.
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
	authMethod: "token" | "keypair";
	hashedToken: string | null;
	tokenPrefix: string | null;
	publicKey: string | null;
	kid: string | null;
	lastUsedAt: Date | null;
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
		authMethod: "token" | "keypair";
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
 * Resolved options with defaults applied.
 */
export type ResolvedAgentAuthOptions = Required<
	Pick<
		AgentAuthOptions,
		| "allowedAuthMethods"
		| "tokenPrefix"
		| "tokenLength"
		| "allowedKeyAlgorithms"
		| "jwtFormat"
		| "jwtMaxAge"
	>
> &
	AgentAuthOptions;
