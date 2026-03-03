/**
 * Shared client credential validation for async auth endpoints.
 * Used by both bc-authorize (routes.ts) and the token handler (token-handler.ts).
 */

import type { GenericEndpointContext } from "@better-auth/core";
import { APIError } from "@better-auth/core/error";
import { symmetricEncrypt } from "../../crypto";
import type { OIDCOptions } from "../oidc-provider/types";
import type { StoreClientSecretOption } from "../oidc-provider/utils";
import {
	defaultClientSecretHasher,
	parseClientCredentials,
	verifyClientSecret,
} from "../oidc-provider/utils";
import { ASYNC_AUTH_ERROR_CODES } from "./error-codes";
import type { AsyncAuthAgent } from "./types";

function constantTimeEqual(a: string, b: string): boolean {
	if (a.length !== b.length) return false;
	let result = 0;
	for (let i = 0; i < a.length; i++) {
		result |= a.charCodeAt(i) ^ b.charCodeAt(i);
	}
	return result === 0;
}

export type MinimalClient = {
	clientId: string;
	clientSecret: string | null | undefined;
	disabled?: boolean;
	metadata?: string | Record<string, unknown> | null;
};

export interface OidcPluginContext {
	oidcOpts: OIDCOptions;
	storeMethod: StoreClientSecretOption;
	trustedClients: NonNullable<OIDCOptions["trustedClients"]>;
	pluginId: string;
}

/**
 * Resolve the OIDC/OAuth provider plugin and extract its options.
 * Throws if neither oidcProvider nor oauthProvider is configured.
 */
export function getOidcPluginContext(
	ctx: GenericEndpointContext,
): OidcPluginContext {
	const oidcPlugin =
		ctx.context.getPlugin("oidc-provider") ||
		ctx.context.getPlugin("oauth-provider");
	if (!oidcPlugin) {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			error: "server_error",
			error_description: ASYNC_AUTH_ERROR_CODES.OIDC_PROVIDER_REQUIRED.message,
		});
	}
	const oidcOpts = (oidcPlugin.options || {}) as OIDCOptions;
	const isOAuthProvider = oidcPlugin.id === "oauth-provider";
	const defaultStoreMethod = isOAuthProvider
		? (oidcOpts as { disableJwtPlugin?: boolean }).disableJwtPlugin
			? "encrypted"
			: "hashed"
		: "plain";
	const storeMethod: StoreClientSecretOption =
		oidcOpts.storeClientSecret ?? defaultStoreMethod;
	const trustedClients = oidcOpts.trustedClients ?? [];

	return { oidcOpts, storeMethod, trustedClients, pluginId: oidcPlugin.id };
}

async function storeSecret(
	secret: string,
	storeMethod: StoreClientSecretOption,
	serverSecret: string,
): Promise<string> {
	if (storeMethod === "hashed") {
		return defaultClientSecretHasher(secret);
	}
	if (storeMethod === "encrypted") {
		return symmetricEncrypt({ key: serverSecret, data: secret });
	}
	if (typeof storeMethod === "object" && "hash" in storeMethod) {
		return storeMethod.hash(secret);
	}
	if (typeof storeMethod === "object" && "encrypt" in storeMethod) {
		return storeMethod.encrypt(secret);
	}
	return secret;
}

/**
 * Lazily creates a DB record for an inline agent so FK constraints pass
 * when storing oauthAccessToken. Only runs once per clientId per process.
 */
async function ensureAgentClientExists(
	ctx: GenericEndpointContext,
	agent: AsyncAuthAgent,
	pluginId: string,
	storeMethod: StoreClientSecretOption,
	ensuredAgents: Set<string>,
): Promise<void> {
	if (ensuredAgents.has(agent.clientId)) return;

	const modelName =
		pluginId === "oidc-provider" ? "oauthApplication" : "oauthClient";
	const existing = await ctx.context.adapter
		.findOne<MinimalClient>({
			model: modelName,
			where: [{ field: "clientId", value: agent.clientId }],
		})
		.catch(() => null);

	if (!existing) {
		const storedSecret = await storeSecret(
			agent.clientSecret,
			storeMethod,
			ctx.context.secret,
		);
		try {
			await ctx.context.adapter.create({
				model: modelName,
				data: {
					clientId: agent.clientId,
					clientSecret: storedSecret,
					name: agent.name ?? agent.clientId,
					type: "web",
					redirectUrls: "http://localhost",
					metadata: agent.metadata ? JSON.stringify(agent.metadata) : undefined,
					disabled: false,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});
		} catch {
			// Unique constraint violation (race condition) is expected —
			// verify the record actually exists before caching.
			const check = await ctx.context.adapter
				.findOne<MinimalClient>({
					model: modelName,
					where: [{ field: "clientId", value: agent.clientId }],
				})
				.catch(() => null);
			if (!check)
				throw new Error(
					`Failed to create agent client record for ${agent.clientId}`,
				);
		}
	}

	ensuredAgents.add(agent.clientId);
}

/**
 * Authenticate a client from request body/headers and verify its secret.
 * Checks inline agents first (plain-text comparison), then falls back
 * to oidcProvider's trusted clients and database.
 */
export async function validateClientCredentials(
	ctx: GenericEndpointContext,
	body: Record<string, unknown>,
	pluginContext: OidcPluginContext,
	agents?: AsyncAuthAgent[],
	ensuredAgents?: Set<string>,
): Promise<{
	client: MinimalClient & { clientSecret: string };
	credentials: { clientId: string; clientSecret: string };
}> {
	const credentials = parseClientCredentials(
		body,
		ctx.request?.headers.get("authorization") || null,
	);

	if (!credentials) {
		throw new APIError("UNAUTHORIZED", {
			error: "invalid_client",
			error_description: ASYNC_AUTH_ERROR_CODES.INVALID_CLIENT.message,
		});
	}

	// 1. Check inline agents (plain-text secret comparison)
	if (agents?.length) {
		const agent = agents.find((a) => a.clientId === credentials.clientId);
		if (
			agent &&
			constantTimeEqual(agent.clientSecret, credentials.clientSecret)
		) {
			if (ensuredAgents) {
				await ensureAgentClientExists(
					ctx,
					agent,
					pluginContext.pluginId,
					pluginContext.storeMethod,
					ensuredAgents,
				);
			}
			return {
				client: {
					clientId: agent.clientId,
					clientSecret: agent.clientSecret,
					metadata: agent.metadata,
				},
				credentials,
			};
		}
		if (agent) {
			throw new APIError("UNAUTHORIZED", {
				error: "invalid_client",
				error_description: ASYNC_AUTH_ERROR_CODES.INVALID_CLIENT.message,
			});
		}
	}

	// 2. Check oidcProvider trusted clients
	const { storeMethod, trustedClients, pluginId } = pluginContext;

	const trustedClient = trustedClients?.find(
		(c) => c.clientId === credentials.clientId,
	);
	let client: MinimalClient | undefined = trustedClient
		? {
				clientId: trustedClient.clientId,
				clientSecret: trustedClient.clientSecret,
				disabled: trustedClient.disabled,
				metadata: trustedClient.metadata,
			}
		: undefined;

	// 3. Check database
	if (!client) {
		const modelName =
			pluginId === "oidc-provider" ? "oauthApplication" : "oauthClient";
		const dbClient = await ctx.context.adapter
			.findOne<MinimalClient>({
				model: modelName,
				where: [{ field: "clientId", value: credentials.clientId }],
			})
			.catch(() => null);
		if (dbClient && !dbClient.disabled) {
			client = dbClient;
		}
	}

	if (!client) {
		throw new APIError("UNAUTHORIZED", {
			error: "invalid_client",
			error_description: ASYNC_AUTH_ERROR_CODES.INVALID_CLIENT.message,
		});
	}

	if (client.disabled) {
		throw new APIError("UNAUTHORIZED", {
			error: "invalid_client",
			error_description: "Client is disabled",
		});
	}

	if (!client.clientSecret) {
		throw new APIError("UNAUTHORIZED", {
			error: "invalid_client",
			error_description: "Client secret is required",
		});
	}

	const isValidSecret = await verifyClientSecret(
		client.clientSecret,
		credentials.clientSecret,
		storeMethod,
		ctx.context.secret,
	);
	if (!isValidSecret) {
		throw new APIError("UNAUTHORIZED", {
			error: "invalid_client",
			error_description: ASYNC_AUTH_ERROR_CODES.INVALID_CLIENT.message,
		});
	}

	return {
		client: client as MinimalClient & { clientSecret: string },
		credentials,
	};
}
