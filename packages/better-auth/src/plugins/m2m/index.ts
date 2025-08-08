import { APIError, createAuthMiddleware } from "../../api";
import type { BetterAuthPlugin } from "../../types/plugins";
import { mergeSchema } from "../../db";
import { m2mSchema } from "./schema";
import { getIp } from "../../utils/get-request-ip";
import { getDate } from "../../utils/date";
import type { M2MOptions } from "./types";
import { createM2MRoutes } from "./routes";
import type { User } from "../../types";
import { generateRandomString } from "../../utils/random";
import { createHash } from "@better-auth/utils/hash";
import { base64Url } from "@better-auth/utils/base64";

export const defaultClientSecretHasher = async (secret: string) => {
	const hash = await createHash("SHA-256").digest(
		new TextEncoder().encode(secret),
	);
	const hashed = base64Url.encode(new Uint8Array(hash), {
		padding: false,
	});
	return hashed;
};

export const ERROR_CODES = {
	INVALID_CLIENT_ID: "Invalid client ID",
	INVALID_CLIENT_SECRET: "Invalid client secret",
	CLIENT_DISABLED: "Client is disabled",
	CLIENT_EXPIRED: "Client has expired",
	INVALID_GRANT_TYPE: "Invalid grant type",
	INVALID_SCOPE: "Invalid scope",
	RATE_LIMIT_EXCEEDED: "Rate limit exceeded",
	UNAUTHORIZED: "Unauthorized",
	CLIENT_NOT_FOUND: "Client not found",
	INVALID_REQUEST: "Invalid request",
};

export const M2M_TABLE_NAME = "m2m_client";

export const m2m = (options?: M2MOptions) => {
	const opts = {
		...options,
		clientSecretHeaders: options?.clientSecretHeaders ?? "x-client-secret",
		defaultClientSecretLength: options?.defaultClientSecretLength || 64,
		maximumClientNameLength: options?.maximumClientNameLength ?? 100,
		minimumClientNameLength: options?.minimumClientNameLength ?? 1,
		enableMetadata: options?.enableMetadata ?? false,
		disableClientSecretHashing: options?.disableClientSecretHashing ?? false,
		requireClientName: options?.requireClientName ?? false,
		rateLimit: {
			enabled:
				options?.rateLimit?.enabled === undefined
					? true
					: options?.rateLimit?.enabled,
			timeWindow: options?.rateLimit?.timeWindow ?? 1000 * 60 * 60 * 24,
			maxRequests: options?.rateLimit?.maxRequests ?? 1000,
		},
		clientExpiration: {
			defaultExpiresIn: options?.clientExpiration?.defaultExpiresIn ?? null,
			disableCustomExpiresTime:
				options?.clientExpiration?.disableCustomExpiresTime ?? false,
			maxExpiresIn: options?.clientExpiration?.maxExpiresIn ?? 365,
			minExpiresIn: options?.clientExpiration?.minExpiresIn ?? 1,
		},
		startingCharactersConfig: {
			shouldStore: options?.startingCharactersConfig?.shouldStore ?? true,
			charactersLength:
				options?.startingCharactersConfig?.charactersLength ?? 6,
		},
		accessTokenExpiresIn: options?.accessTokenExpiresIn ?? 3600, // 1 hour
		refreshTokenExpiresIn: options?.refreshTokenExpiresIn ?? 2592000, // 30 days
	} satisfies M2MOptions;

	const schema = mergeSchema(
		m2mSchema({
			rateLimitMax: opts.rateLimit.maxRequests,
			timeWindow: opts.rateLimit.timeWindow,
		}),
		opts.schema,
	);

	const plugin: BetterAuthPlugin = {
		id: "m2m",
		schema,
		options: opts,
		$Infer: {
			m2mClient: {} as any,
		},
		api: {
			"/m2m/token": {
				POST: createAuthMiddleware({
					auth: false,
					async handler(ctx) {
						const { body } = ctx;
						const { grant_type, client_id, client_secret, scope } = body;

						// Validate grant_type
						if (!grant_type) {
							throw new APIError("BAD_REQUEST", {
								error_description: "grant_type is required",
								error: "invalid_request",
							});
						}

						if (grant_type !== "client_credentials") {
							throw new APIError("BAD_REQUEST", {
								error_description: "grant_type must be 'client_credentials'",
								error: "unsupported_grant_type",
							});
						}

						// Validate client_id and client_secret
						if (!client_id) {
							throw new APIError("BAD_REQUEST", {
								error_description: "client_id is required",
								error: "invalid_request",
							});
						}

						if (!client_secret) {
							throw new APIError("BAD_REQUEST", {
								error_description: "client_secret is required",
								error: "invalid_request",
							});
						}

						// Find the M2M client
						const client = await ctx.context.adapter.findOne({
							model: M2M_TABLE_NAME,
							where: [
								{
									field: "clientId",
									value: client_id.toString(),
								},
							],
						});

						if (!client) {
							throw new APIError("UNAUTHORIZED", {
								error_description: ERROR_CODES.CLIENT_NOT_FOUND,
								error: "invalid_client",
							});
						}

						// Check if client is disabled
						if (client.disabled) {
							throw new APIError("UNAUTHORIZED", {
								error_description: ERROR_CODES.CLIENT_DISABLED,
								error: "invalid_client",
							});
						}

						// Check if client has expired
						if (client.expiresAt && client.expiresAt < new Date()) {
							throw new APIError("UNAUTHORIZED", {
								error_description: ERROR_CODES.CLIENT_EXPIRED,
								error: "invalid_client",
							});
						}

						// Verify client secret
						const isValidSecret = await verifyStoredClientSecret(
							ctx,
							client.clientSecret,
							client_secret.toString(),
						);

						if (!isValidSecret) {
							throw new APIError("UNAUTHORIZED", {
								error_description: ERROR_CODES.INVALID_CLIENT_SECRET,
								error: "invalid_client",
							});
						}

						// Validate scope if provided
						if (scope) {
							const requestedScopes = scope.toString().split(" ");
							const allowedScopes = client.scopes || [];
							
							const hasInvalidScope = requestedScopes.some(
								(requestedScope) => !allowedScopes.includes(requestedScope)
							);

							if (hasInvalidScope) {
								throw new APIError("BAD_REQUEST", {
									error_description: ERROR_CODES.INVALID_SCOPE,
									error: "invalid_scope",
								});
							}
						}

						// Generate access token
						const accessToken = generateRandomString(32, "a-z", "A-Z");
						const refreshToken = generateRandomString(32, "a-z", "A-Z");
						const accessTokenExpiresAt = new Date(
							Date.now() + opts.accessTokenExpiresIn * 1000,
						);
						const refreshTokenExpiresAt = new Date(
							Date.now() + opts.refreshTokenExpiresIn * 1000,
						);

						// Store the tokens
						await ctx.context.adapter.create({
							model: "oauthAccessToken",
							data: {
								accessToken,
								refreshToken,
								accessTokenExpiresAt,
								refreshTokenExpiresAt,
								clientId: client_id.toString(),
								userId: null, // M2M clients don't have a user
								scopes: scope ? scope.toString().split(" ") : client.scopes || [],
								createdAt: new Date(),
								updatedAt: new Date(),
							},
						});

						// Return the tokens
						return ctx.json({
							access_token: accessToken,
							token_type: "bearer",
							expires_in: opts.accessTokenExpiresIn,
							refresh_token: refreshToken,
							scope: scope || client.scopes?.join(" ") || "",
						});
					},
				}),
			},
			...createM2MRoutes(opts),
		},
	};

	return plugin;
};

async function verifyStoredClientSecret(
	ctx: any,
	storedClientSecret: string,
	clientSecret: string,
): Promise<boolean> {
	if (ctx.context.options.plugins?.m2m?.disableClientSecretHashing) {
		return storedClientSecret === clientSecret;
	}

	const hashedSecret = await defaultClientSecretHasher(clientSecret);
	return storedClientSecret === hashedSecret;
} 