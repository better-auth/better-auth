import type { AuthContext, GenericEndpointContext } from "@better-auth/core";
import { BetterAuthError } from "@better-auth/core/error";
import { base64, base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
import {
	constantTimeEqual,
	makeSignature,
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
		throw new BetterAuthError("jwt_config");
	}
	return plugin;
};

/**
 * Normalizes timestamp-like values returned by adapters.
 *
 * Accepts Date instances, epoch milliseconds as numbers, and strings that are
 * either ISO dates or numeric millisecond values such as "1774295570569.0".
 */
export function normalizeTimestampValue(value: unknown): Date | undefined {
	if (value == null) {
		return undefined;
	}

	if (value instanceof Date) {
		return Number.isFinite(value.getTime()) ? value : undefined;
	}

	if (typeof value === "number") {
		if (!Number.isFinite(value)) {
			return undefined;
		}

		const parsed = new Date(value);
		return Number.isFinite(parsed.getTime()) ? parsed : undefined;
	}

	if (typeof value === "string") {
		const trimmed = value.trim();
		if (!trimmed.length) {
			return undefined;
		}

		const numeric = Number(trimmed);
		if (Number.isFinite(numeric)) {
			const parsed = new Date(numeric);
			return Number.isFinite(parsed.getTime()) ? parsed : undefined;
		}

		const parsed = new Date(trimmed);
		return Number.isFinite(parsed.getTime()) ? parsed : undefined;
	}

	return undefined;
}

/**
 * Resolves a session auth time from common adapter return shapes.
 */
export function resolveSessionAuthTime(value: unknown): Date | undefined {
	if (value instanceof Date) {
		return normalizeTimestampValue(value);
	}

	if (!value || typeof value !== "object") {
		return normalizeTimestampValue(value);
	}

	const direct =
		normalizeTimestampValue((value as Record<string, unknown>).createdAt) ??
		normalizeTimestampValue((value as Record<string, unknown>).created_at);

	if (direct) {
		return direct;
	}

	const nested = (value as Record<string, unknown>).session;
	if (!nested || typeof nested !== "object") {
		return undefined;
	}

	return (
		normalizeTimestampValue((nested as Record<string, unknown>).createdAt) ??
		normalizeTimestampValue((nested as Record<string, unknown>).created_at)
	);
}

const cachedTrustedClients = new TTLCache<string, SchemaClient<Scope[]>>();

export async function verifyOAuthQueryParams(
	oauth_query: string,
	secret: string,
) {
	const queryParams = new URLSearchParams(oauth_query);
	const sig = queryParams.get("sig");
	const exp = Number(queryParams.get("exp"));
	queryParams.delete("sig");
	const verifySig = await makeSignature(queryParams.toString(), secret);
	return (
		!!sig &&
		constantTimeEqual(sig, verifySig) &&
		new Date(exp * 1000) >= new Date()
	);
}

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
			key: ctx.context.secretConfig,
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
	} else if (storageMethod === "encrypted") {
		try {
			const decryptedClientSecret = await decryptStoredClientSecret(
				ctx,
				storageMethod,
				storedClientSecret,
			);
			return (
				!!clientSecret && constantTimeEqual(decryptedClientSecret, clientSecret)
			);
		} catch {
			return false;
		}
	} else if (typeof storageMethod === "object" && "decrypt" in storageMethod) {
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
			key: ctx.context.secretConfig,
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
	clientSecret?: string,
	scopes?: string[],
	preVerifiedClient?: SchemaClient<Scope[]>,
) {
	const client = preVerifiedClient ?? (await getClient(ctx, options, clientId));
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

	// Enforce registered auth method: private_key_jwt clients must use assertion
	if (
		client.tokenEndpointAuthMethod === "private_key_jwt" &&
		!preVerifiedClient
	) {
		throw new APIError("BAD_REQUEST", {
			error_description:
				"client registered for private_key_jwt must use client_assertion",
			error: "invalid_client",
		});
	}

	// Skip secret checks for pre-verified clients (already authenticated via assertion)
	if (!preVerifiedClient) {
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
				error_description:
					"public client, client secret should not be received",
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

export type ExtractedCredentials =
	| {
			method: "client_secret_basic" | "client_secret_post";
			clientId: string;
			clientSecret: string;
	  }
	| {
			method: "private_key_jwt";
			clientId: string;
			client: SchemaClient<Scope[]>;
	  }
	| {
			method: "none";
			clientId: string;
	  };

/**
 * Extracts and resolves client credentials from the request.
 * Supports: client_secret_basic, client_secret_post, private_key_jwt, and none (public).
 */
export async function extractClientCredentials(
	ctx: GenericEndpointContext,
	opts: OAuthOptions<Scope[]>,
	expectedAudience?: string,
): Promise<ExtractedCredentials | null> {
	const body = (ctx.body ?? {}) as Record<string, unknown>;
	const authorization = ctx.request?.headers.get("authorization") ?? undefined;

	// 1. Check for private_key_jwt assertion
	if (body.client_assertion_type || body.client_assertion) {
		if (!body.client_assertion || !body.client_assertion_type) {
			throw new APIError("BAD_REQUEST", {
				error_description:
					"client_assertion and client_assertion_type must both be provided",
				error: "invalid_client",
			});
		}
		if (body.client_secret || authorization?.startsWith("Basic ")) {
			throw new APIError("BAD_REQUEST", {
				error_description:
					"client_assertion cannot be combined with client_secret or Basic auth",
				error: "invalid_client",
			});
		}
		const { verifyClientAssertion: verify } = await import(
			"./client-assertion"
		);
		const result = await verify(
			ctx,
			opts,
			body.client_assertion as string,
			body.client_assertion_type as string,
			body.client_id as string | undefined,
			expectedAudience,
		);
		return {
			method: "private_key_jwt",
			clientId: result.clientId,
			client: result.client,
		};
	}

	// 2. Check for Basic auth header
	if (authorization?.startsWith("Basic ")) {
		const res = basicToClientCredentials(authorization);
		if (res) {
			return {
				method: "client_secret_basic",
				clientId: res.client_id,
				clientSecret: res.client_secret,
			};
		}
	}

	// 3. Check body params
	if (body.client_id && body.client_secret) {
		return {
			method: "client_secret_post",
			clientId: body.client_id as string,
			clientSecret: body.client_secret as string,
		};
	}

	// 4. client_id only (public client)
	if (body.client_id) {
		return { method: "none", clientId: body.client_id as string };
	}

	return null;
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
 * Extracts the sector identifier (hostname) from a client's first redirect URI.
 *
 * @see https://openid.net/specs/openid-connect-core-1_0.html#PairwiseAlg
 * @internal
 */
function getSectorIdentifier(client: SchemaClient<Scope[]>): string {
	const uri = client.redirectUris?.[0];
	if (!uri) {
		throw new BetterAuthError(
			"Client has no redirect URIs for sector identifier",
		);
	}
	return new URL(uri).host;
}

/**
 * Computes a pairwise subject identifier using HMAC-SHA256.
 *
 * @see https://openid.net/specs/openid-connect-core-1_0.html#PairwiseAlg
 * @internal
 */
async function computePairwiseSub(
	userId: string,
	client: SchemaClient<Scope[]>,
	secret: string,
): Promise<string> {
	const sectorId = getSectorIdentifier(client);
	return makeSignature(`${sectorId}.${userId}`, secret);
}

/**
 * Returns the appropriate subject identifier for a user+client pair.
 * Uses pairwise when the client opts in and the server has a secret configured.
 *
 * @internal
 */
export async function resolveSubjectIdentifier(
	userId: string,
	client: SchemaClient<Scope[]>,
	opts: OAuthOptions<Scope[]>,
): Promise<string> {
	if (client.subjectType === "pairwise" && opts.pairwiseSecret) {
		return computePairwiseSub(userId, client, opts.pairwiseSecret);
	}
	return userId;
}

/**
 * Converts URLSearchParams to a plain object, preserving
 * multi-valued keys as arrays instead of discarding duplicates.
 */
export function searchParamsToQuery(
	params: URLSearchParams,
): Record<string, string | string[]> {
	const result: Record<string, string | string[]> = Object.create(null);
	for (const key of new Set(params.keys())) {
		const values = params.getAll(key);
		result[key] = values.length === 1 ? values[0]! : values;
	}
	return result;
}

/**
 * Deletes a prompt value
 *
 * @param ctx
 * @param prompt - the prompt value to delete
 */
export function deleteFromPrompt(query: URLSearchParams, prompt: Prompt) {
	const prompts = query.get("prompt")?.split(" ");
	const foundPrompt = prompts?.findIndex((v) => v === prompt) ?? -1;
	if (foundPrompt >= 0) {
		prompts?.splice(foundPrompt, 1);
		prompts?.length
			? query.set("prompt", prompts.join(" "))
			: query.delete("prompt");
	}
	return searchParamsToQuery(query);
}

enum PKCERequirementErrors {
	PUBLIC_CLIENT = "pkce is required for public clients",
	OFFLINE_ACCESS_SCOPE = "pkce is required when requesting offline_access scope",
	CLIENT_REQUIRE_PKCE = "pkce is required for this client",
}
/**
 * Determines if PKCE is required for a given client and scope.
 *
 * PKCE is always required for:
 * 1. Public clients (cannot securely store client_secret)
 * 2. Requests with offline_access scope (refresh token security)
 *
 * For confidential clients without offline_access:
 * - Uses client.requirePKCE if set (defaults to true)
 *
 * Returns false if PKCE is not required, or the reason it is required.
 *
 * @internal
 */
export function isPKCERequired(
	client: SchemaClient<Scope[]>,
	requestedScopes?: string[],
): false | PKCERequirementErrors {
	// Determine if client is public
	const isPublicClient =
		client.tokenEndpointAuthMethod === "none" ||
		client.type === "native" ||
		client.type === "user-agent-based" ||
		client.public === true;

	// PKCE always required for public clients
	if (isPublicClient) {
		return PKCERequirementErrors.PUBLIC_CLIENT;
	}

	// PKCE always required for offline_access scope (refresh tokens)
	if (requestedScopes?.includes("offline_access")) {
		return PKCERequirementErrors.OFFLINE_ACCESS_SCOPE;
	}

	if (client.requirePKCE ?? true) {
		return PKCERequirementErrors.CLIENT_REQUIRE_PKCE;
	}

	return false;
}
