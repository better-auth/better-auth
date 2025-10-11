import type { GenericEndpointContext } from "packages/core/dist";
import type { OAuthOptions } from "../types";
import { APIError } from "../../../api";
import { getClient, storeClientSecret } from "../utils";
import {
	checkOAuthClient,
	databaseToSchema,
	oauthToSchema,
	schemaToDatabase,
	schemaToOAuth,
} from "../register";
import type { DatabaseClient } from "../register";
import type { OAuthClient } from "../../../oauth-2.1/types";
import { generateRandomString } from "../../../crypto";

export async function getClientEndpoint(
	ctx: GenericEndpointContext & { params: { id: string } },
	opts: OAuthOptions,
) {
	const client = await getClient(ctx, opts, ctx.params.id);
	if (!client) {
		throw new APIError("NOT_FOUND", {
			error_description: "client not found",
			error: "not_found",
		});
	}
	// Never return @internal client_secret
	if (client?.clientSecret) {
		client.clientSecret = undefined;
	}
	return schemaToOAuth(client, false);
}

export async function deleteClientEndpoint(
	ctx: GenericEndpointContext & { params: { id: string } },
	opts: OAuthOptions,
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
				field: "id",
				value: ctx.params.id,
			},
		],
	});
}

export async function updateClientEndpoint(
	ctx: GenericEndpointContext & { params: { id: string } },
	opts: OAuthOptions,
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
					field: "id",
					value: ctx.params.id,
				},
			],
			update: schemaToDatabase(oauthToSchema(updates)),
		})
		.then((res) => {
			return databaseToSchema(res as DatabaseClient);
		});

	// Never return @internal client_secret
	if (updatedClient?.clientSecret) {
		updatedClient.clientSecret = undefined;
	}
	return schemaToOAuth(updatedClient, false);
}

export async function rotateClientSecretEndpoint(
	ctx: GenericEndpointContext & { params: { id: string } },
	opts: OAuthOptions,
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
					field: "id",
					value: ctx.params.id,
				},
			],
			update: {
				client_secret: storedClientSecret,
			},
		})
		.then((res) => {
			return databaseToSchema(res as DatabaseClient);
		});
	return schemaToOAuth(
		{
			...updatedClient,
			clientSecret: (opts.clientSecretPrefix ?? "") + clientSecret,
		},
		false,
	);
}
