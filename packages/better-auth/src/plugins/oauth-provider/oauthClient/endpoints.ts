import type { GenericEndpointContext } from "@better-auth/core";
import { APIError } from "../../../api";
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
	ctx: GenericEndpointContext & { params: { id: string } },
	opts: OAuthOptions<Scope[]>,
) {
	const client = await getClient(ctx, opts, ctx.params.id);
	if (!client) {
		throw new APIError("NOT_FOUND", {
			error_description: "client not found",
			error: "not_found",
		});
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
	const { user_id, reference_id } = ctx.query;

	if (user_id) {
		const dbClients = await ctx.context.adapter
			.findMany<DatabaseClient>({
				model: opts.schema?.oauthClient?.modelName ?? "oauthClient",
				where: [{ field: "userId", value: user_id }],
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
	} else if (reference_id) {
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
	} else {
		throw new APIError("BAD_REQUEST", {
			message: "either user_id or reference_id must be provided",
		});
	}
}

export async function deleteClientEndpoint(
	ctx: GenericEndpointContext & { params: { id: string } },
	opts: OAuthOptions<Scope[]>,
) {
	const client = await getClient(ctx, opts, ctx.params.id);
	if (!client) {
		throw new APIError("NOT_FOUND", {
			error_description: "client not found",
			error: "not_found",
		});
	}

	await ctx.context.adapter.delete({
		model: opts.schema?.oauthClient?.modelName ?? "oauthClient",
		where: [
			{
				field: "clientId",
				value: ctx.params.id,
			},
		],
	});
}

export async function updateClientEndpoint(
	ctx: GenericEndpointContext & { params: { id: string } },
	opts: OAuthOptions<Scope[]>,
) {
	const trustedClient = opts.trustedClients?.find(
		(client) => client.clientId === ctx.params.id,
	);
	if (trustedClient) {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			error_description: "trusted clients must be updated manually",
			error: "invalid_client",
		});
	}

	const client = await getClient(ctx, opts, ctx.params.id);
	if (!client) {
		throw new APIError("NOT_FOUND", {
			error_description: "client not found",
			error: "not_found",
		});
	}

	const updates = ctx.body as OAuthClient;
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
					value: ctx.params.id,
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
	ctx: GenericEndpointContext & { params: { id: string } },
	opts: OAuthOptions<Scope[]>,
) {
	const trustedClient = opts.trustedClients?.find(
		(client) => client.clientId === ctx.params.id,
	);
	if (trustedClient) {
		throw new APIError("INTERNAL_SERVER_ERROR", {
			error_description: "trusted clients must be updated manually",
			error: "invalid_client",
		});
	}

	const client = await getClient(ctx, opts, ctx.params.id);
	if (!client) {
		throw new APIError("NOT_FOUND", {
			error_description: "client not found",
			error: "not_found",
		});
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
					value: ctx.params.id,
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
