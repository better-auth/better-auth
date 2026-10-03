import type { GenericEndpointContext } from "@better-auth/core";
import { APIError, getSessionFromCtx } from "better-auth/api";
import { generateRandomString } from "better-auth/crypto";
import type { OAuthClientRegistrationMetadata } from "../register";
import { checkOAuthClient, oauthToSchema, schemaToOAuth } from "../register";
import type {
	OAuthClientAdministrativeResponse,
	OAuthClientRegistrationResponse,
	OAuthOptions,
	SchemaClient,
	Scope,
} from "../types";
import type { GrantType } from "../types/oauth";
import { getClient, storeClientSecret } from "../utils";
import {
	normalizeClientCredentialsScopes,
	validateClientCredentialsScopes,
} from "./client-credentials";
import { assertClientPrivileges } from "./privileges";

type OAuthClientUpdate = Omit<
	OAuthClientRegistrationMetadata,
	"application_type" | "client_id" | "resources"
> & {
	application_type?: "web" | "native";
	client_credentials_scopes?: string[];
};

export async function getClientEndpoint(
	ctx: GenericEndpointContext & { query: { client_id: string } },
	opts: OAuthOptions<Scope[]>,
) {
	const session = await getSessionFromCtx(ctx);
	await assertClientPrivileges(ctx, session, opts, "read");
	if (!session) throw new APIError("UNAUTHORIZED");

	const client = await getClient(ctx, opts, ctx.query.client_id);
	if (!client) {
		throw new APIError("NOT_FOUND", {
			error_description: "client not found",
			error: "not_found",
		});
	}

	if (client.userId) {
		if (client.userId !== session.user.id) throw new APIError("UNAUTHORIZED");
	} else if (client.referenceId && opts.clientReference) {
		if (client.referenceId !== (await opts.clientReference(session)))
			throw new APIError("UNAUTHORIZED");
	} else {
		throw new APIError("UNAUTHORIZED");
	}

	// Never return @internal client_secret
	const res = schemaToOAuth(client);
	res.client_secret = undefined;
	return res;
}

/**
 * Provides public client fields for any logged-in user.
 * This is commonly used to display information on login flow pages.
 */
export async function getClientPublicEndpoint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	clientId: string,
) {
	const client = await getClient(ctx, opts, clientId);
	if (!client) {
		throw new APIError("NOT_FOUND", {
			error_description: "client not found",
			error: "not_found",
		});
	}
	if (client.disabled) {
		throw new APIError("NOT_FOUND", {
			error_description: "client not found",
			error: "not_found",
		});
	}
	// Manually provide common client fields for login flow pages
	const res = schemaToOAuth({
		clientId: client.clientId,
		name: client.name,
		uri: client.uri,
		contacts: client.contacts,
		icon: client.icon,
		tos: client.tos,
		policy: client.policy,
	});
	return res;
}

export async function getClientsEndpoint(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
) {
	const session = await getSessionFromCtx(ctx);
	await assertClientPrivileges(ctx, session, opts, "list");
	if (!session) throw new APIError("UNAUTHORIZED");

	const referenceId = await opts.clientReference?.(session);
	if (referenceId) {
		const dbClients = await ctx.context.adapter
			.findMany<SchemaClient<Scope[]>>({
				model: "oauthClient",
				where: [{ field: "referenceId", value: referenceId }],
			})
			.then((res) => {
				if (!res) return null;
				return res.map((v) => {
					const res = schemaToOAuth(v);
					res.client_secret = undefined;
					return res;
				});
			});
		return dbClients;
	} else if (session.user.id) {
		const dbClients = await ctx.context.adapter
			.findMany<SchemaClient<Scope[]>>({
				model: "oauthClient",
				where: [{ field: "userId", value: session.user.id }],
			})
			.then((res) => {
				if (!res) return null;
				return res.map((v) => {
					const res = schemaToOAuth(v);
					res.client_secret = undefined;
					return res;
				});
			});
		return dbClients;
	} else {
		throw new APIError("BAD_REQUEST", {
			message: "either user_id or reference_id must be provided",
		});
	}
}

export async function deleteClientEndpoint(
	ctx: GenericEndpointContext & { body: { client_id: string } },
	opts: OAuthOptions<Scope[]>,
) {
	const session = await getSessionFromCtx(ctx);
	await assertClientPrivileges(ctx, session, opts, "delete");
	if (!session) throw new APIError("UNAUTHORIZED");

	const clientId = ctx.body.client_id;
	const trustedClient = opts.cachedTrustedClients?.has(clientId);
	if (trustedClient) {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			error_description: "trusted clients must be updated manually",
			error: "invalid_client",
		});
	}

	const client = await getClient(ctx, opts, clientId);
	if (!client) {
		throw new APIError("NOT_FOUND", {
			error_description: "client not found",
			error: "not_found",
		});
	}

	if (client.userId) {
		if (client.userId !== session.user.id) throw new APIError("UNAUTHORIZED");
	} else if (client.referenceId && opts.clientReference) {
		if (client.referenceId !== (await opts.clientReference(session)))
			throw new APIError("UNAUTHORIZED");
	} else {
		throw new APIError("UNAUTHORIZED");
	}

	await ctx.context.adapter.delete({
		model: "oauthClient",
		where: [
			{
				field: "clientId",
				value: clientId,
			},
		],
	});
}

export function updateClientEndpoint(
	ctx: GenericEndpointContext & {
		body: {
			client_id: string;
			update: OAuthClientUpdate;
		};
	},
	opts: OAuthOptions<Scope[]>,
	settings: { admin: true },
): Promise<OAuthClientAdministrativeResponse>;
export function updateClientEndpoint(
	ctx: GenericEndpointContext & {
		body: {
			client_id: string;
			update: OAuthClientUpdate;
		};
	},
	opts: OAuthOptions<Scope[]>,
	settings?: { admin?: false },
): Promise<OAuthClientRegistrationResponse>;
export async function updateClientEndpoint(
	ctx: GenericEndpointContext & {
		body: {
			client_id: string;
			update: OAuthClientUpdate;
		};
	},
	opts: OAuthOptions<Scope[]>,
	settings?: { admin?: boolean },
): Promise<
	OAuthClientAdministrativeResponse | OAuthClientRegistrationResponse
> {
	const session = await getSessionFromCtx(ctx);
	await assertClientPrivileges(ctx, session, opts, "update");
	if (!session) throw new APIError("UNAUTHORIZED");

	const clientId = ctx.body.client_id;
	const trustedClient = opts.cachedTrustedClients?.has(clientId);
	if (trustedClient) {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			error_description: "trusted clients must be updated manually",
			error: "invalid_client",
		});
	}

	const client = await getClient(ctx, opts, clientId);
	if (!client) {
		throw new APIError("NOT_FOUND", {
			error_description: "client not found",
			error: "not_found",
		});
	}

	const { client_credentials_scopes: rawClientCredentialsScopes, ...updates } =
		ctx.body.update;
	const ownsClient = client.userId
		? client.userId === session.user.id
		: client.referenceId && opts.clientReference
			? client.referenceId === (await opts.clientReference(session))
			: false;
	const isCrossOwnerScopeConfiguration =
		!ownsClient &&
		settings?.admin &&
		rawClientCredentialsScopes !== undefined &&
		Object.keys(updates).length === 0;
	if (!ownsClient && !isCrossOwnerScopeConfiguration) {
		throw new APIError("UNAUTHORIZED");
	}
	if (isCrossOwnerScopeConfiguration) {
		await assertClientPrivileges(
			ctx,
			session,
			opts,
			"configure-client-credentials-scopes",
		);
	}

	if (
		Object.keys(updates).length === 0 &&
		rawClientCredentialsScopes === undefined
	) {
		// Never return @internal client_secret
		const res = schemaToOAuth(client);
		res.client_secret = undefined;
		if (settings?.admin) {
			return {
				...res,
				client_credentials_scopes: [...(client.clientCredentialsScopes ?? [])],
			};
		}
		return res;
	}

	const finalGrantTypes = (updates.grant_types ??
		client.grantTypes ??
		[]) as GrantType[];
	const finalTokenEndpointAuthMethod =
		updates.token_endpoint_auth_method ?? client.tokenEndpointAuthMethod;
	const clientCredentialsScopes =
		rawClientCredentialsScopes === undefined
			? undefined
			: normalizeClientCredentialsScopes(rawClientCredentialsScopes);
	if (clientCredentialsScopes !== undefined) {
		validateClientCredentialsScopes(
			clientCredentialsScopes,
			finalGrantTypes,
			finalTokenEndpointAuthMethod,
			opts,
		);
		if (clientCredentialsScopes.length > 0 && !isCrossOwnerScopeConfiguration) {
			await assertClientPrivileges(
				ctx,
				session,
				opts,
				"configure-client-credentials-scopes",
			);
		}
	}

	await checkOAuthClient(
		{
			...schemaToOAuth(client),
			...updates,
		},
		opts,
		{
			ctx,
		},
	);

	// Clear obsolete auth material when switching auth methods
	const schemaUpdates: Record<string, unknown> = {
		...oauthToSchema(updates),
	};
	if (
		!finalGrantTypes.includes("client_credentials") ||
		finalTokenEndpointAuthMethod === "none"
	) {
		schemaUpdates.clientCredentialsScopes = [];
	} else if (clientCredentialsScopes !== undefined) {
		schemaUpdates.clientCredentialsScopes = clientCredentialsScopes;
	}
	if (updates.token_endpoint_auth_method) {
		if (updates.token_endpoint_auth_method === "private_key_jwt") {
			schemaUpdates.clientSecret = null;
		} else {
			schemaUpdates.jwks = null;
			schemaUpdates.jwksUri = null;
			// Generate a new secret when switching away from private_key_jwt
			// to prevent clients from being stuck without credentials
			if (!schemaUpdates.clientSecret) {
				const rawSecret =
					opts.generateClientSecret?.() ||
					generateRandomString(32, "a-z", "A-Z");
				schemaUpdates.clientSecret = await storeClientSecret(
					ctx,
					opts,
					rawSecret,
				);
			}
		}
	}

	const updatedClient = await ctx.context.adapter.update<SchemaClient<Scope[]>>(
		{
			model: "oauthClient",
			where: [
				{
					field: "clientId",
					value: clientId,
				},
			],
			update: {
				...schemaUpdates,
				updatedAt: new Date(Math.floor(Date.now() / 1000) * 1000),
			},
		},
	);
	if (!updatedClient) {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			error_description: "unable to update client",
			error: "invalid_client",
		});
	}
	// Never return @internal client_secret
	const res = schemaToOAuth(updatedClient);
	res.client_secret = undefined;
	if (settings?.admin) {
		return {
			...res,
			client_credentials_scopes: [
				...(updatedClient.clientCredentialsScopes ?? []),
			],
		};
	}
	return res;
}

export async function rotateClientSecretEndpoint(
	ctx: GenericEndpointContext & { body: { client_id: string } },
	opts: OAuthOptions<Scope[]>,
) {
	const session = await getSessionFromCtx(ctx);
	await assertClientPrivileges(ctx, session, opts, "rotate");
	if (!session) throw new APIError("UNAUTHORIZED");

	const clientId = ctx.body.client_id;
	const trustedClient = opts.cachedTrustedClients?.has(clientId);
	if (trustedClient) {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			error_description: "trusted clients must be updated manually",
			error: "invalid_client",
		});
	}

	const client = await getClient(ctx, opts, clientId);
	if (!client) {
		throw new APIError("NOT_FOUND", {
			error_description: "client not found",
			error: "not_found",
		});
	}

	if (client.userId) {
		if (client.userId !== session.user.id) throw new APIError("UNAUTHORIZED");
	} else if (client.referenceId && opts.clientReference) {
		if (client.referenceId !== (await opts.clientReference(session)))
			throw new APIError("UNAUTHORIZED");
	} else {
		throw new APIError("UNAUTHORIZED");
	}

	if (client.tokenEndpointAuthMethod === "none" || !client.clientSecret) {
		throw new APIError("BAD_REQUEST", {
			error_description:
				"secret rotation is only available for clients using client_secret authentication",
			error: "invalid_client",
		});
	}

	const clientSecret =
		opts.generateClientSecret?.() || generateRandomString(32, "a-z", "A-Z");
	const storedClientSecret = clientSecret
		? await storeClientSecret(ctx, opts, clientSecret)
		: undefined;
	const updatedClient = await ctx.context.adapter.update<SchemaClient<Scope[]>>(
		{
			model: "oauthClient",
			where: [
				{
					field: "clientId",
					value: clientId,
				},
			],
			update: {
				clientSecret: storedClientSecret,
				updatedAt: new Date(Math.floor(Date.now() / 1000) * 1000),
			},
		},
	);

	if (!updatedClient) {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			error_description: "unable to update client",
			error: "invalid_client",
		});
	}

	return schemaToOAuth({
		...updatedClient,
		clientSecret: (opts.prefix?.clientSecret ?? "") + clientSecret,
	});
}
