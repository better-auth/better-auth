import type { AuthContext, GenericEndpointContext } from "@better-auth/core";
import { BetterAuthError } from "@better-auth/core/error";
import { base64, base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
import {
	constantTimeEqual,
	symmetricDecrypt,
	symmetricEncrypt,
} from "better-auth/crypto";
import type { jwt } from "better-auth/plugins";
import { APIError } from "better-call";
import type { oauthProvider } from "../oauth";
import type {
	OAuthOptions,
	Prompt,
	SchemaClient,
	Scope,
	StoreTokenType,
} from "../types";

class TTLCache<K, V extends { expiresAt?: Date }> {
	private cache = new Map<K, V>();
	constructor() {}

	set(key: K, value: V) {
		this.cache.set(key, value);
	}

	get(key: K): V | undefined {
		const entry = this.cache.get(key);
		if (!entry) return undefined;
		if (entry.expiresAt && entry.expiresAt < new Date()) {
			this.cache.delete(key);
			return undefined;
		}
		return entry;
	}
}

/**
 * Gets the oAuth Provider Plugin
 * @internal
 */
export const getOAuthProviderPlugin = (ctx: AuthContext) => {
	return ctx.getPlugin("oauth-provider") satisfies ReturnType<
		typeof oauthProvider
	> | null;
};

/**
 * Gets the JWT Plugin
 * @internal
 */
export const getJwtPlugin = (ctx: AuthContext) => {
	const plugin = ctx.getPlugin("jwt") satisfies ReturnType<typeof jwt> | null;
	if (!plugin) {
		throw new BetterAuthError("jwt_config", "jwt plugin not found");
	}
	return plugin;
};

const cachedTrustedClients = new TTLCache<string, SchemaClient<Scope[]>>();

/**
 * Get a client by ID, checking trusted clients first, then database
 */
export async function getClient(
	ctx: GenericEndpointContext,
	options: OAuthOptions<Scope[]>,
	clientId: string,
) {
	const trustedClient = cachedTrustedClients.get(clientId);
	if (trustedClient) {
		return Object.assign({}, trustedClient);
	}

	const dbClient = await ctx.context.adapter.findOne<SchemaClient<Scope[]>>({
		model: options.schema?.oauthClient?.modelName ?? "oauthClient",
		where: [{ field: "clientId", value: clientId }],
	});

	if (dbClient && options.cachedTrustedClients?.has(clientId)) {
		cachedTrustedClients.set(clientId, Object.assign({}, dbClient));
	}

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
	storageMethod: OAuthOptions<Scope[]>["storeClientSecret"],
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
	opts: OAuthOptions<Scope[]>,
	storedClientSecret: string,
	clientSecret?: string,
): Promise<boolean> {
	const storageMethod =
		opts.storeClientSecret ?? (opts.disableJwtPlugin ? "encrypted" : "hashed");

	if (clientSecret && opts.prefix?.clientSecret) {
		if (clientSecret.startsWith(opts.prefix?.clientSecret)) {
			clientSecret = clientSecret.replace(opts.prefix.clientSecret, "");
		} else {
			throw new APIError("UNAUTHORIZED", {
				error_description: "invalid client_secret",
				error: "invalid_client",
			});
		}
	}

	if (storageMethod === "hashed") {
		const hashedClientSecret = clientSecret
			? await defaultHasher(clientSecret)
			: undefined;
		return (
			!!hashedClientSecret &&
			constantTimeEqual(hashedClientSecret, storedClientSecret)
		);
	} else if (typeof storageMethod === "object" && "hash" in storageMethod) {
		if (storageMethod.verify) {
			return (
				!!clientSecret &&
				(await storageMethod.verify(clientSecret, storedClientSecret))
			);
		} else {
			const hashedClientSecret = clientSecret
				? await storageMethod.hash(clientSecret)
				: undefined;
			return (
				!!hashedClientSecret &&
				constantTimeEqual(hashedClientSecret, storedClientSecret)
			);
		}
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
			!!clientSecret && constantTimeEqual(decryptedClientSecret, clientSecret)
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
	opts: OAuthOptions<Scope[]>,
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
	storageMethod: OAuthOptions<Scope[]>["storeTokens"] = "hashed",
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
	storageMethod: OAuthOptions<Scope[]>["storeTokens"] = "hashed",
	token: string,
	type: StoreTokenType,
) {
	if (storageMethod === "hashed") {
		const hashedToken = await defaultHasher(token);
		return hashedToken;
	} else if (typeof storageMethod === "object" && "hash" in storageMethod) {
		const hashedToken = await storageMethod.hash(token, type);
		return hashedToken;
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
	options: OAuthOptions<Scope[]>,
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

	// If scopes set, check against client allowed scopes
	if (scopes && client.scopes) {
		const validScopes = new Set(client.scopes);
		for (const sc of scopes) {
			if (!validScopes.has(sc)) {
				throw new APIError("BAD_REQUEST", {
					error_description: `client does not allow scope ${sc}`,
					error: "invalid_scope",
				});
			}
		}
	}

	return client;
}

/**
 * Parse client metadata that may be stored as JSON string or already parsed object.
 * Handles database adapters that auto-parse JSON columns.
 *
 * @internal
 */
export function parseClientMetadata(
	metadata: string | object | undefined,
): object | undefined {
	if (!metadata) return undefined;
	return typeof metadata === "string" ? JSON.parse(metadata) : metadata;
}

/**
 * Parse space-separated prompt string into a set of prompts
 *
 * @param prompt
 */
export function parsePrompt(prompt: string) {
	const prompts = prompt.split(" ").map((p) => p.trim());
	const set = new Set<Prompt>();
	for (const p of prompts) {
		if (
			p === "login" ||
			p === "consent" ||
			p === "create" ||
			p === "select_account" ||
			p === "none"
		) {
			set.add(p);
		}
	}
	return new Set(set);
}

/**
 * Deletes a prompt value
 *
 * @param ctx
 * @param prompt - the prompt value to delete
 */
export function deleteFromPrompt(query: URLSearchParams, prompt: Prompt) {
	let prompts = query.get("prompt")?.split(" ");
	const foundPrompt = prompts?.findIndex((v) => v === prompt) ?? -1;
	if (foundPrompt >= 0) {
		prompts?.splice(foundPrompt, 1);
		prompts?.length
			? query.set("prompt", prompts.join(" "))
			: query.delete("prompt");
	}
	return Object.fromEntries(query);
}

/**
 * Determines if a client is a public client based on its configuration.
 *
 * Public clients include:
 * - Clients with explicit `public: true`
 * - Native applications (type: "native")
 * - User-agent-based applications (type: "user-agent-based")
 *
 * @param client - The OAuth client to check
 * @returns true if the client is public, false if confidential
 *
 * @internal
 */
export function isPublicClient<T extends Scope[]>(
	client: SchemaClient<T>,
): boolean {
	// Explicit public flag takes precedence
	if (client.public === true) return true;
	if (client.public === false) return false;

	// Check client type (OAuth 2.0 spec)
	if (client.type === "native" || client.type === "user-agent-based") {
		return true;
	}

	// Default: treat as confidential (web application)
	return false;
}

/**
 * Determines if PKCE is required for a given client based on
 * client type and server configuration.
 *
 * PKCE requirements:
 * - Public clients ALWAYS require PKCE (OAuth 2.1 compliance)
 * - Confidential clients respect the `requirePKCE` option
 *
 * @param client - The OAuth client
 * @param options - OAuth provider options
 * @returns true if PKCE is required for this client
 *
 * @internal
 */
export function requiresPKCEForClient<T extends Scope[]>(
	client: SchemaClient<T>,
	options: OAuthOptions<T>,
): boolean {
	// Public clients ALWAYS require PKCE
	if (isPublicClient(client)) return true;

	// Confidential clients respect global setting (default: true)
	return options.requirePKCE !== false;
}
