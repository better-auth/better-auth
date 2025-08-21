import { APIError, createAuthMiddleware } from "../../api";
import type { M2MOptions } from "./types";
import { generateRandomString } from "../../utils/random";
import { defaultClientSecretHasher } from "./index";
import { M2M_TABLE_NAME } from "./index";

export const createM2MRoutes = (options: M2MOptions) => {
	return {
		"/m2m/clients": {
			POST: createAuthMiddleware({
				auth: true,
				async handler(ctx) {
					const { body } = ctx;
					const { name, scopes, metadata, expiresIn } = body;

					// Validate name if required
					if (options.requireClientName && !name) {
						throw new APIError("BAD_REQUEST", {
							error_description: "Client name is required",
							error: "invalid_request",
						});
					}

					// Validate name length
					if (name) {
						if (name.length < options.minimumClientNameLength) {
							throw new APIError("BAD_REQUEST", {
								error_description: `Client name must be at least ${options.minimumClientNameLength} characters`,
								error: "invalid_request",
							});
						}
						if (name.length > options.maximumClientNameLength) {
							throw new APIError("BAD_REQUEST", {
								error_description: `Client name must be at most ${options.maximumClientNameLength} characters`,
								error: "invalid_request",
							});
						}
					}

					// Validate metadata if enabled
					if (metadata && !options.enableMetadata) {
						throw new APIError("BAD_REQUEST", {
							error_description: "Metadata is disabled",
							error: "invalid_request",
						});
					}

					// Validate expiration
					if (expiresIn) {
						if (options.clientExpiration?.disableCustomExpiresTime) {
							throw new APIError("BAD_REQUEST", {
								error_description: "Custom expiration times are disabled",
								error: "invalid_request",
							});
						}
						if (expiresIn < (options.clientExpiration?.minExpiresIn || 1)) {
							throw new APIError("BAD_REQUEST", {
								error_description: `Expiration must be at least ${options.clientExpiration?.minExpiresIn || 1} days`,
								error: "invalid_request",
							});
						}
						if (expiresIn > (options.clientExpiration?.maxExpiresIn || 365)) {
							throw new APIError("BAD_REQUEST", {
								error_description: `Expiration must be at most ${options.clientExpiration?.maxExpiresIn || 365} days`,
								error: "invalid_request",
							});
						}
					}

					// Generate client ID and secret
					const clientId = generateRandomString(32, "a-z", "A-Z", "0-9");
					const clientSecret = generateRandomString(
						options.defaultClientSecretLength,
						"a-z",
						"A-Z",
						"0-9",
					);

					// Hash the client secret
					const hashedSecret = await defaultClientSecretHasher(clientSecret);

					// Calculate expiration date
					const expiresAt = expiresIn
						? new Date(Date.now() + expiresIn * 24 * 60 * 60 * 1000)
						: options.clientExpiration?.defaultExpiresIn
							? new Date(
									Date.now() +
										options.clientExpiration.defaultExpiresIn *
											24 *
											60 *
											60 *
											1000,
								)
							: undefined;

					// Store starting characters if enabled
					const startingCharacters = options.startingCharactersConfig?.shouldStore
						? clientSecret.substring(0, options.startingCharactersConfig.charactersLength)
						: undefined;

					// Create the M2M client
					const client = await ctx.context.adapter.create({
						model: M2M_TABLE_NAME,
						data: {
							clientId,
							clientSecret: hashedSecret,
							name: name || undefined,
							disabled: false,
							expiresAt,
							scopes: scopes || [],
							metadata: metadata || undefined,
							startingCharacters,
							createdAt: new Date(),
							updatedAt: new Date(),
						},
					});

					return ctx.json({
						id: client.id,
						clientId: client.clientId,
						clientSecret, // Return the plain secret only once
						name: client.name,
						scopes: client.scopes,
						metadata: client.metadata,
						expiresAt: client.expiresAt,
						startingCharacters: client.startingCharacters,
						createdAt: client.createdAt,
					});
				},
			}),
			GET: createAuthMiddleware({
				auth: true,
				async handler(ctx) {
					const { query } = ctx;
					const { limit = "50", offset = "0" } = query;

					const clients = await ctx.context.adapter.findMany({
						model: M2M_TABLE_NAME,
						limit: parseInt(limit.toString()),
						offset: parseInt(offset.toString()),
						orderBy: {
							field: "createdAt",
							direction: "desc",
						},
					});

					// Remove sensitive data
					const safeClients = clients.map((client) => ({
						id: client.id,
						clientId: client.clientId,
						name: client.name,
						disabled: client.disabled,
						expiresAt: client.expiresAt,
						scopes: client.scopes,
						metadata: client.metadata,
						startingCharacters: client.startingCharacters,
						createdAt: client.createdAt,
						updatedAt: client.updatedAt,
					}));

					return ctx.json(safeClients);
				},
			}),
		},
		"/m2m/clients/:id": {
			GET: createAuthMiddleware({
				auth: true,
				async handler(ctx) {
					const { params } = ctx;
					const { id } = params;

					const client = await ctx.context.adapter.findOne({
						model: M2M_TABLE_NAME,
						where: [
							{
								field: "id",
								value: id.toString(),
							},
						],
					});

					if (!client) {
						throw new APIError("NOT_FOUND", {
							error_description: "Client not found",
							error: "not_found",
						});
					}

					// Remove sensitive data
					const safeClient = {
						id: client.id,
						clientId: client.clientId,
						name: client.name,
						disabled: client.disabled,
						expiresAt: client.expiresAt,
						scopes: client.scopes,
						metadata: client.metadata,
						startingCharacters: client.startingCharacters,
						createdAt: client.createdAt,
						updatedAt: client.updatedAt,
					};

					return ctx.json(safeClient);
				},
			}),
			PUT: createAuthMiddleware({
				auth: true,
				async handler(ctx) {
					const { params, body } = ctx;
					const { id } = params;
					const { name, scopes, metadata, disabled, expiresIn } = body;

					const client = await ctx.context.adapter.findOne({
						model: M2M_TABLE_NAME,
						where: [
							{
								field: "id",
								value: id.toString(),
							},
						],
					});

					if (!client) {
						throw new APIError("NOT_FOUND", {
							error_description: "Client not found",
							error: "not_found",
						});
					}

					// Validate name if provided
					if (name !== undefined) {
						if (name.length < options.minimumClientNameLength) {
							throw new APIError("BAD_REQUEST", {
								error_description: `Client name must be at least ${options.minimumClientNameLength} characters`,
								error: "invalid_request",
							});
						}
						if (name.length > options.maximumClientNameLength) {
							throw new APIError("BAD_REQUEST", {
								error_description: `Client name must be at most ${options.maximumClientNameLength} characters`,
								error: "invalid_request",
							});
						}
					}

					// Validate metadata if provided
					if (metadata !== undefined && !options.enableMetadata) {
						throw new APIError("BAD_REQUEST", {
							error_description: "Metadata is disabled",
							error: "invalid_request",
						});
					}

					// Validate expiration if provided
					if (expiresIn !== undefined) {
						if (options.clientExpiration?.disableCustomExpiresTime) {
							throw new APIError("BAD_REQUEST", {
								error_description: "Custom expiration times are disabled",
								error: "invalid_request",
							});
						}
						if (expiresIn < (options.clientExpiration?.minExpiresIn || 1)) {
							throw new APIError("BAD_REQUEST", {
								error_description: `Expiration must be at least ${options.clientExpiration?.minExpiresIn || 1} days`,
								error: "invalid_request",
							});
						}
						if (expiresIn > (options.clientExpiration?.maxExpiresIn || 365)) {
							throw new APIError("BAD_REQUEST", {
								error_description: `Expiration must be at most ${options.clientExpiration?.maxExpiresIn || 365} days`,
								error: "invalid_request",
							});
						}
					}

					// Calculate new expiration date
					const expiresAt = expiresIn !== undefined
						? expiresIn === null
							? null
							: new Date(Date.now() + expiresIn * 24 * 60 * 60 * 1000)
						: client.expiresAt;

					// Update the client
					const updatedClient = await ctx.context.adapter.update({
						model: M2M_TABLE_NAME,
						where: [
							{
								field: "id",
								value: id.toString(),
							},
						],
						data: {
							...(name !== undefined && { name }),
							...(scopes !== undefined && { scopes }),
							...(metadata !== undefined && { metadata }),
							...(disabled !== undefined && { disabled }),
							...(expiresIn !== undefined && { expiresAt }),
							updatedAt: new Date(),
						},
					});

					// Remove sensitive data
					const safeClient = {
						id: updatedClient.id,
						clientId: updatedClient.clientId,
						name: updatedClient.name,
						disabled: updatedClient.disabled,
						expiresAt: updatedClient.expiresAt,
						scopes: updatedClient.scopes,
						metadata: updatedClient.metadata,
						startingCharacters: updatedClient.startingCharacters,
						createdAt: updatedClient.createdAt,
						updatedAt: updatedClient.updatedAt,
					};

					return ctx.json(safeClient);
				},
			}),
			DELETE: createAuthMiddleware({
				auth: true,
				async handler(ctx) {
					const { params } = ctx;
					const { id } = params;

					const client = await ctx.context.adapter.findOne({
						model: M2M_TABLE_NAME,
						where: [
							{
								field: "id",
								value: id.toString(),
							},
						],
					});

					if (!client) {
						throw new APIError("NOT_FOUND", {
							error_description: "Client not found",
							error: "not_found",
						});
					}

					// Delete the client
					await ctx.context.adapter.delete({
						model: M2M_TABLE_NAME,
						where: [
							{
								field: "id",
								value: id.toString(),
							},
						],
					});

					return ctx.json({ success: true });
				},
			}),
		},
	};
}; 