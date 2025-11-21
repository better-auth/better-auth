import type { GenericEndpointContext } from "@better-auth/core";
import { APIError, getSessionFromCtx } from "../../../api";
import { generateRandomString } from "../../../crypto";
import type { OAuthClient } from "../../../oauth-2.1/types";
import type { DatabaseClient } from "../register";
import {
	checkOAuthClient,
	databaseToSchema,
	oauthToSchema,
	schemaToDatabase,
	schemaToOAuth,
} from "../register";
import type { OAuthOptions, Scope } from "../types";
import { getClient, storeClientSecret } from "../utils";

export async function getClientEndpoint(
	ctx: GenericEndpointContext & { query: { client_id: string } },
	opts: OAuthOptions<Scope[]>,
) {
	const session = await getSessionFromCtx(ctx);
	if (!session) throw new APIError("UNAUTHORIZED");
	if (
		opts.clientPrivileges &&
		!(await opts.clientPrivileges({
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
	if (
		opts.clientPrivileges &&
		!(await opts.clientPrivileges({
			action: "list",
			session: session.session,
			user: session.user,
		}))
	) {
		throw new APIError("UNAUTHORIZED");
	}

	const reference_id = await opts.clientReference?.(session);
	if (reference_id) {
		const dbClients = await ctx.context.adapter
			.findMany<DatabaseClient>({
				model: opts.schema?.oauthClient?.modelName ?? "oauthClient",
				where: [{ field: "referenceId", value: reference_id }],
			})
			.then((res) => {
				if (!res) return null;
				return res.map((v) => {
					const res = schemaToOAuth(databaseToSchema(v));
					res.client_secret = undefined;
					return res;
				});
			});
		return dbClients;
	} else if (session.user.id) {
		const dbClients = await ctx.context.adapter
			.findMany<DatabaseClient>({
				model: opts.schema?.oauthClient?.modelName ?? "oauthClient",
				where: [{ field: "userId", value: session.user.id }],
			})
			.then((res) => {
				if (!res) return null;
				return res.map((v) => {
					const res = schemaToOAuth(databaseToSchema(v));
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
	if (
		opts.clientPrivileges &&
		!(await opts.clientPrivileges({
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

	await ctx.context.adapter.delete({
		model: opts.schema?.oauthClient?.modelName ?? "oauthClient",
		where: [
			{
				field: "clientId",
				value: ctx.query.client_id,
			},
		],
	});
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
	if (
		opts.clientPrivileges &&
		!(await opts.clientPrivileges({
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
	const updatedClient = await ctx.context.adapter
		.update<DatabaseClient>({
			model: opts.schema?.oauthClient?.modelName ?? "oauthClient",
			where: [
				{
					field: "clientId",
					value: clientId,
				},
			],
			update: schemaToDatabase(oauthToSchema(updates)),
		})
		.then((res) => {
			if (!res) return null;
			return databaseToSchema(res);
		});
	if (!updatedClient) {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			error_description: "unable to update client",
			error: "invalid_client",
		});
	}
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
	if (
		opts.clientPrivileges &&
		!(await opts.clientPrivileges({
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
	const updatedClient = await ctx.context.adapter
		.update<DatabaseClient>({
			model: opts.schema?.oauthClient?.modelName ?? "oauthClient",
			where: [
				{
					field: "clientId",
					value: clientId,
				},
			],
			update: schemaToDatabase(
				oauthToSchema({
					...schemaToOAuth(client),
					client_secret: storedClientSecret,
				}),
			),
		})
		.then((res) => {
			if (!res) return null;
			return databaseToSchema(res);
		});

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
