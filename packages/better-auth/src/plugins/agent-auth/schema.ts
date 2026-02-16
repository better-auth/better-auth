import type { BetterAuthPluginDBSchema } from "@better-auth/core/db";
import { parseJSON } from "../../client/parser";

export const agentSchema = () =>
	({
		agent: {
			fields: {
				/**
				 * Friendly name for the agent (e.g. "Claude Finance Helper")
				 */
				name: {
					type: "string",
					required: true,
					input: false,
				},
				/**
				 * The user who created/registered this agent.
				 */
				userId: {
					type: "string",
					references: { model: "user", field: "id", onDelete: "cascade" },
					required: true,
					input: false,
					index: true,
				},
				/**
				 * Optional organization this agent belongs to.
				 */
				orgId: {
					type: "string",
					required: false,
					input: false,
					index: true,
				},
				/**
				 * JSON array of scope strings (e.g. '["email.send","reports.read"]')
				 */
				scopes: {
					type: "string",
					required: false,
					input: false,
					transform: {
						input(value: unknown) {
							return JSON.stringify(value);
						},
						output(value: unknown) {
							if (!value) return [];
							return parseJSON<string[]>(value as string);
						},
					},
				},
				/**
				 * Optional role name (e.g. "agent", "finance_agent")
				 */
				role: {
					type: "string",
					required: false,
					input: false,
				},
				/**
				 * Agent status: "active" or "revoked"
				 */
				status: {
					type: "string",
					required: true,
					input: false,
					defaultValue: "active",
				},
				/**
				 * Auth method: "token" or "keypair".
				 * Inferred at creation from the presence of publicKey.
				 */
				authMethod: {
					type: "string",
					required: true,
					input: false,
				},
				/**
				 * SHA-256 hash of the bearer token (token method only).
				 */
				hashedToken: {
					type: "string",
					required: false,
					input: false,
					index: true,
				},
				/**
				 * First 8 characters of the token for display purposes (token method only).
				 */
				tokenPrefix: {
					type: "string",
					required: false,
					input: false,
				},
				/**
				 * Agent's public key as JWK JSON string (keypair method only).
				 * The private key is never stored server-side.
				 */
				publicKey: {
					type: "string",
					required: false,
					input: false,
				},
				/**
				 * Key ID for the public key (keypair method only).
				 */
				kid: {
					type: "string",
					required: false,
					input: false,
				},
				/**
				 * Timestamp of the last authenticated request by this agent.
				 */
				lastUsedAt: {
					type: "date",
					required: false,
					input: false,
				},
				/**
				 * Optional JSON metadata (runtime type, version, etc.)
				 */
				metadata: {
					type: "string",
					required: false,
					input: true,
					transform: {
						input(value: unknown) {
							return JSON.stringify(value);
						},
						output(value: unknown) {
							if (!value) return null;
							return parseJSON<Record<string, unknown>>(value as string);
						},
					},
				},
				/**
				 * When the agent was created.
				 */
				createdAt: {
					type: "date",
					required: true,
					input: false,
				},
				/**
				 * When the agent was last updated.
				 */
				updatedAt: {
					type: "date",
					required: true,
					input: false,
				},
			},
		},
	}) satisfies BetterAuthPluginDBSchema;
