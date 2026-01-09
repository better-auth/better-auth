import type { GenericEndpointContext } from "@better-auth/core";
import { APIError, getSessionFromCtx } from "better-auth/api";
import { generateRandomString } from "better-auth/crypto";
import { checkOAuthClient, oauthToSchema, schemaToOAuth } from "../register";
import type { OAuthOptions, SchemaClient, Scope } from "../types";
import type { OAuthClient } from "../types/oauth";
import { getClient, storeClientSecret } from "../utils";

export async function getClientEndpoint(
	ctx: GenericEndpointContext & { query: { client_id: string } },
	opts: OAuthOptions<Scope[]>,
) {
	const session = await getSessionFromCtx(ctx);
	if (!session) throw new APIError("UNAUTHORIZED");
	if (!ctx.request) throw new APIError("BAD_REQUEST");
	if (
		opts.clientPrivileges &&
		!(await opts.clientPrivileges({
			headers: ctx.request.headers,
			action: "read",
			session: session.session,
			user: session.user,
		}))
	) {
		throw new APIError("UNAUTHORIZED");
	}

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
	ctx: GenericEndpointContext & { query: { client_id: string } },
	opts: OAuthOptions<Scope[]>,
) {
	const client = await getClient(ctx, opts, ctx.query.client_id);
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
	if (!session) throw new APIError("UNAUTHORIZED");
	if (!ctx.request) throw new APIError("BAD_REQUEST");
	if (
		opts.clientPrivileges &&
		!(await opts.clientPrivileges({
			headers: ctx.request.headers,
			action: "list",
			session: session.session,
			user: session.user,
		}))
	) {
		throw new APIError("UNAUTHORIZED");
	}

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
	if (!session) throw new APIError("UNAUTHORIZED");
	if (!ctx.request) throw new APIError("BAD_REQUEST");
	if (
		opts.clientPrivileges &&
		!(await opts.clientPrivileges({
			headers: ctx.request.headers,
			action: "delete",
			session: session.session,
			user: session.user,
		}))
	) {
		throw new APIError("UNAUTHORIZED");
	}

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

	await opts.databaseHooks?.beforeDeleteClient?.({ schema: client });
	await ctx.context.adapter.delete({
		model: "oauthClient",
		where: [
			{
				field: "clientId",
				value: clientId,
			},
		],
	});
	await opts.databaseHooks?.afterDeleteClient?.({ schema: client });
}

export async function updateClientEndpoint(
	ctx: GenericEndpointContext & {
		body: {
			client_id: string;
			update: Omit<Partial<OAuthClient>, "client_id">;
		};
	},
	opts: OAuthOptions<Scope[]>,
) {
	const session = await getSessionFromCtx(ctx);
	if (!session) throw new APIError("UNAUTHORIZED");
	if (!ctx.request) throw new APIError("BAD_REQUEST");
	if (
		opts.clientPrivileges &&
		!(await opts.clientPrivileges({
			headers: ctx.request.headers,
			action: "update",
			session: session.session,
			user: session.user,
		}))
	) {
		throw new APIError("UNAUTHORIZED");
	}

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

	const updates = ctx.body.update as OAuthClient;
	if (Object.keys(updates).length === 0) {
		// Never return @internal client_secret
		const res = schemaToOAuth(client);
		res.client_secret = undefined;
		return res;
	}

	await checkOAuthClient(
		{
			...schemaToOAuth(client),
			...updates,
		},
		opts,
	);
	const schema = oauthToSchema(updates);
	const additionalData = await opts.databaseHooks?.beforeUpdateClient?.({
		schema,
	});
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
				...(typeof additionalData === "object" && "data" in additionalData
					? additionalData.data
					: {}),
				...schema,
			},
		},
	);
	if (!updatedClient) {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			error_description: "unable to update client",
			error: "invalid_client",
		});
	}
	await opts.databaseHooks?.afterUpdateClient?.({ schema: updatedClient });
	// Never return @internal client_secret
	const res = schemaToOAuth(updatedClient);
	res.client_secret = undefined;
	return res;
}

export async function rotateClientSecretEndpoint(
	ctx: GenericEndpointContext & { body: { client_id: string } },
	opts: OAuthOptions<Scope[]>,
) {
	const session = await getSessionFromCtx(ctx);
	if (!session) throw new APIError("UNAUTHORIZED");
	if (!ctx.request) throw new APIError("BAD_REQUEST");
	if (
		opts.clientPrivileges &&
		!(await opts.clientPrivileges({
			headers: ctx.request.headers,
			action: "rotate",
			session: session.session,
			user: session.user,
		}))
	) {
		throw new APIError("UNAUTHORIZED");
	}

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

	if (client.public || !client.clientSecret) {
		throw new APIError("BAD_REQUEST", {
			error_description: "public clients cannot be updated",
			error: "invalid_client",
		});
	}

	const clientSecret =
		opts.generateClientSecret?.() || generateRandomString(32, "a-z", "A-Z");
	const storedClientSecret = clientSecret
		? await storeClientSecret(ctx, opts, clientSecret)
		: undefined;
	const additionalData = await opts.databaseHooks?.beforeUpdateClient?.({
		schema: client,
	});
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
				...additionalData,
				...client,
				clientSecret: storedClientSecret,
			},
		},
	);
	if (!updatedClient) {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			error_description: "unable to update client",
			error: "invalid_client",
		});
	}
	await opts.databaseHooks?.afterUpdateClient?.({ schema: updatedClient });

	return schemaToOAuth({
		...updatedClient,
		clientSecret: (opts.prefix?.clientSecret ?? "") + clientSecret,
	});
}
