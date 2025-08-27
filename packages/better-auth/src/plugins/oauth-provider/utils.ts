import { APIError } from "../../api";
import type { AuthContext, GenericEndpointContext } from "../../types";
import { BetterAuthError } from "../../error";
import type { jwt } from "../jwt";
import { base64, base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
import type { OAuthOptions, SchemaClient } from "./types";
import { symmetricDecrypt, symmetricEncrypt } from "../../crypto";

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
	const dbClient = await ctx.context.adapter.findOne<SchemaClient>({
		model: options.schema?.oauthApplication?.modelName ?? "oauthApplication",
		where: [{ field: "clientId", value: clientId }],
	});

	return dbClient as (SchemaClient & { skipConsent?: boolean }) | null;
}

/**
 * Default client secret hasher using SHA-256
 */
export const defaultClientSecretHasher = async (clientSecret: string) => {
	const hash = await createHash("SHA-256").digest(
		new TextEncoder().encode(clientSecret),
	);
	const hashed = base64Url.encode(new Uint8Array(hash), {
		padding: false,
	});
	return hashed;
};

/**
 * Decrypts a storedClientSecret for signing
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
	}
	if (typeof storageMethod === "object" && "decrypt" in storageMethod) {
		return await storageMethod.decrypt(storedClientSecret);
	}

	throw new BetterAuthError(
		`Unsupported decryption storageMethod type '${storageMethod}'`,
	);
}

/**
 * Verify stored client secret against provided client secret
 */
export async function verifyStoredClientSecret(
	ctx: GenericEndpointContext,
	opts: OAuthOptions,
	storedClientSecret: string,
	clientSecret?: string,
): Promise<boolean> {
	const storageMethod =
		opts.storeClientSecret ?? (opts.disableJWTPlugin ? "encrypted" : "hashed");

	if (storageMethod === "hashed") {
		const hashedClientSecret = clientSecret
			? await defaultClientSecretHasher(clientSecret)
			: undefined;
		return hashedClientSecret === storedClientSecret;
	}
	if (typeof storageMethod === "object" && "hash" in storageMethod) {
		const hashedClientSecret = clientSecret
			? await storageMethod.hash(clientSecret)
			: undefined;
		return hashedClientSecret === storedClientSecret;
	}
	if (
		storageMethod === "encrypted" ||
		(typeof storageMethod === "object" && "decrypt" in storageMethod)
	) {
		const decryptedClientSecret = await decryptStoredClientSecret(
			ctx,
			storageMethod,
			storedClientSecret,
		);
		return decryptedClientSecret === clientSecret;
	}

	throw new BetterAuthError(
		`Unsupported verify storageMethod type '${storageMethod}'`,
	);
}

/**
 * Store client secret according to the configured storage method
 */
export async function storeClientSecret(
	ctx: GenericEndpointContext,
	opts: OAuthOptions,
	clientSecret: string,
) {
	const storageMethod =
		opts.storeClientSecret ?? (opts.disableJWTPlugin ? "encrypted" : "hashed");

	if (storageMethod === "encrypted") {
		return await symmetricEncrypt({
			key: ctx.context.secret,
			data: clientSecret,
		});
	}
	if (storageMethod === "hashed") {
		return await defaultClientSecretHasher(clientSecret);
	}
	if (typeof storageMethod === "object" && "hash" in storageMethod) {
		return await storageMethod.hash(clientSecret);
	}
	if (typeof storageMethod === "object" && "encrypt" in storageMethod) {
		return await storageMethod.encrypt(clientSecret);
	}

	throw new BetterAuthError(
		`Unsupported storeClientSecret type '${storageMethod}'`,
	);
}

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
		const [id, secret] = decoded.split(":");
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
