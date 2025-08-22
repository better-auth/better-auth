import { APIError } from "../../api";
import type { AuthContext, GenericEndpointContext } from "@better-auth/core";
import { BetterAuthError } from "@better-auth/core/error";
import type { jwt } from "../jwt";
import type { oauthProvider } from "../oauth-provider";
import { base64, base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
import type { OAuthOptions, StoreTokenType } from "./types";
import { symmetricDecrypt, symmetricEncrypt } from "../../crypto";
import { databaseToSchema, type DatabaseClient } from "./register";
import { timingSafeEqual } from "crypto";

/**
 * Gets the oAuth Provider Plugin
 * @internal
 */
export const getOAuthProviderPlugin = (ctx: AuthContext) => {
	return ctx.options.plugins?.find(
		(plugin) => plugin.id === "oauthProvider",
	) as ReturnType<typeof oauthProvider>;
};

/**
 * Gets the JWT Plugin
 * @internal
 */
export const getJwtPlugin = (ctx: AuthContext) => {
	const plugin = ctx.options.plugins?.find((plugin) => plugin.id === "jwt");
	if (!plugin) {
		throw new BetterAuthError("jwt_config", "jwt plugin not found");
	}
	return plugin as ReturnType<typeof jwt>;
};

/**
 * Get a client by ID, checking trusted clients first, then database
 */
export async function getClient(
	ctx: GenericEndpointContext,
	options: OAuthOptions,
	clientId: string,
) {
	const trustedClient = options.trustedClients?.find(
		(client) => client.clientId === clientId,
	);
	if (trustedClient) {
		return trustedClient;
	}
	const dbClient = await ctx.context.adapter
		.findOne<DatabaseClient>({
			model: options.schema?.oauthClient?.modelName ?? "oauthClient",
			where: [{ field: "clientId", value: clientId }],
		})
		.then((res) => {
			if (!res) return null;
			return databaseToSchema(res);
		});
	return dbClient;
}

/**
 * Default client secret hasher using SHA-256
 *
 * @internal
 */
const defaultHasher = async (value: string) => {
	const hash = await createHash("SHA-256").digest(
		new TextEncoder().encode(value),
	);
	const hashed = base64Url.encode(new Uint8Array(hash), {
		padding: false,
	});
	return hashed;
};

/**
 * Decrypts a storedClientSecret for signing
 *
 * @internal
 */
export async function decryptStoredClientSecret(
	ctx: GenericEndpointContext,
	storageMethod: OAuthOptions["storeClientSecret"],
	storedClientSecret: string,
) {
	if (storageMethod === "encrypted") {
		return await symmetricDecrypt({
			key: ctx.context.secret,
			data: storedClientSecret,
		});
	} else if (typeof storageMethod === "object" && "decrypt" in storageMethod) {
		return await storageMethod.decrypt(storedClientSecret);
	}

	throw new BetterAuthError(
		`Unsupported decryption storageMethod type '${storageMethod}'`,
	);
}

/**
 * Verify stored client secret against provided client secret
 *
 * @internal
 */
async function verifyStoredClientSecret(
	ctx: GenericEndpointContext,
	opts: OAuthOptions,
	storedClientSecret: string,
	clientSecret?: string,
): Promise<boolean> {
	const storageMethod =
		opts.storeClientSecret ?? (opts.disableJwtPlugin ? "encrypted" : "hashed");

	if (clientSecret && opts.clientSecretPrefix) {
		if (clientSecret.startsWith(opts.clientSecretPrefix)) {
			clientSecret = clientSecret.replace(opts.clientSecretPrefix, "");
		} else {
			throw new APIError("UNAUTHORIZED", {
				error_description: "invalid client_secret",
				error: "invalid_client",
			});
		}
	}

	function sideChannelEqual(valueA: string, valueB: string) {
		// Use timing-safe comparison to avoid side-channel leaks
		const a = Buffer.from(valueA, "utf8");
		const b = Buffer.from(valueB, "utf8");
		// Inputs must be the same length for timingSafeEqual
		return a.length === b.length && timingSafeEqual(a, b);
	}

	if (storageMethod === "hashed") {
		const hashedClientSecret = clientSecret
			? await defaultHasher(clientSecret)
			: undefined;
		return (
			!!hashedClientSecret &&
			sideChannelEqual(hashedClientSecret, storedClientSecret)
		);
	} else if (typeof storageMethod === "object" && "hash" in storageMethod) {
		const hashedClientSecret = clientSecret
			? await storageMethod.hash(clientSecret)
			: undefined;
		return (
			!!hashedClientSecret &&
			sideChannelEqual(hashedClientSecret, storedClientSecret)
		);
	} else if (
		storageMethod === "encrypted" ||
		(typeof storageMethod === "object" && "decrypt" in storageMethod)
	) {
		const decryptedClientSecret = await decryptStoredClientSecret(
			ctx,
			storageMethod,
			storedClientSecret,
		);
		return (
			!!clientSecret && sideChannelEqual(decryptedClientSecret, clientSecret)
		);
	}

	throw new BetterAuthError(
		`Unsupported verify storageMethod type '${storageMethod}'`,
	);
}

/**
 * Store client secret according to the configured storage method
 *
 * @internal
 */
export async function storeClientSecret(
	ctx: GenericEndpointContext,
	opts: OAuthOptions,
	clientSecret: string,
) {
	const storageMethod =
		opts.storeClientSecret ?? (opts.disableJwtPlugin ? "encrypted" : "hashed");

	if (storageMethod === "encrypted") {
		return await symmetricEncrypt({
			key: ctx.context.secret,
			data: clientSecret,
		});
	} else if (storageMethod === "hashed") {
		return await defaultHasher(clientSecret);
	} else if (typeof storageMethod === "object" && "hash" in storageMethod) {
		return await storageMethod.hash(clientSecret);
	} else if (typeof storageMethod === "object" && "encrypt" in storageMethod) {
		return await storageMethod.encrypt(clientSecret);
	}

	throw new BetterAuthError(
		`Unsupported storeClientSecret type '${storageMethod}'`,
	);
}

/**
 * Stores a token value (ie opaque tokens, refresh tokens, transaction tokens, verification codes)
 * on the database in a secure hashed format.
 *
 * @internal
 */
export async function storeToken(
	storageMethod: OAuthOptions["storeTokens"] = "hashed",
	token: string,
	type: StoreTokenType,
) {
	if (storageMethod === "hashed") {
		return await defaultHasher(token);
	} else if (typeof storageMethod === "object" && "hash" in storageMethod) {
		return await storageMethod.hash(token, type);
	}

	throw new BetterAuthError(
		`storeToken: unsupported storageMethod type '${storageMethod}'`,
	);
}

/**
 * Gets a hashed token value to find on the database.
 *
 * @internal
 */
export async function getStoredToken(
	storageMethod: OAuthOptions["storeTokens"] = "hashed",
	token: string,
	type: StoreTokenType,
) {
	if (storageMethod === "hashed") {
		const hashedClientSecret = await defaultHasher(token);
		return hashedClientSecret;
	} else if (typeof storageMethod === "object" && "hash" in storageMethod) {
		const hashedClientSecret = await storageMethod.hash(token, type);
		return hashedClientSecret;
	}

	throw new BetterAuthError(
		`getStoredToken: unsupported storageMethod type '${storageMethod}'`,
	);
}

/**
 * Converts a BASIC authorization header
 * into its client_id and client_secret representation
 *
 * @internal
 */
export function basicToClientCredentials(authorization: string) {
	if (authorization.startsWith("Basic ")) {
		const encoded = authorization.replace("Basic ", "");
		const decoded = new TextDecoder().decode(base64.decode(encoded));
		if (!decoded.includes(":")) {
			throw new APIError("BAD_REQUEST", {
				error_description: "invalid authorization header format",
				error: "invalid_client",
			});
		}
		const [id, secret] = decoded.split(":", 2);
		if (!id || !secret) {
			throw new APIError("BAD_REQUEST", {
				error_description: "invalid authorization header format",
				error: "invalid_client",
			});
		}
		return {
			client_id: id,
			client_secret: secret,
		};
	}
}

/**
 * Validates client credentials failing on mismatches
 * and incorrectly provided information
 *
 * @internal
 */
export async function validateClientCredentials(
	ctx: GenericEndpointContext,
	options: OAuthOptions,
	clientId: string,
	clientSecret?: string, // optional because required if client is confidential or this value is defined
	scopes?: string[], // checks requested scopes against allowed scopes
) {
	const client = await getClient(ctx, options, clientId);
	if (!client) {
		throw new APIError("BAD_REQUEST", {
			error_description: "missing client",
			error: "invalid_client",
		});
	}
	if (client.disabled) {
		throw new APIError("BAD_REQUEST", {
			error_description: "client is disabled",
			error: "invalid_client",
		});
	}

	// Require secret for confidential clients
	if (!client.public && !clientSecret) {
		throw new APIError("BAD_REQUEST", {
			error_description: "client secret must be provided",
			error: "invalid_client",
		});
	}

	// Secret should not be received
	if (clientSecret && !client.clientSecret) {
		throw new APIError("BAD_REQUEST", {
			error_description: "public client, client secret should not be received",
			error: "invalid_client",
		});
	}

	// Compare Secrets when secret is provided
	if (
		clientSecret &&
		!(await verifyStoredClientSecret(
			ctx,
			options,
			client.clientSecret!,
			clientSecret,
		))
	) {
		throw new APIError("UNAUTHORIZED", {
			error_description: "invalid client_secret",
			error: "invalid_client",
		});
	}

	// If allowed scopes if set, must check against scopes
	if (client.allowedScopes) {
		if (!scopes) {
			throw new APIError("BAD_REQUEST", {
				error_description: "must request a scope",
				error: "invalid_scope",
			});
		}
		for (const sc of scopes) {
			if (!client.allowedScopes.includes(sc)) {
				throw new APIError("BAD_REQUEST", {
					error_description: `client does not allow scope ${sc}`,
					error: "invalid_scope",
				});
			}
		}
	}

	return client;
}
