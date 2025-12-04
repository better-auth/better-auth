import type { GenericEndpointContext } from "@better-auth/core";
import { base64, base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
import type { JWK } from "jose";
import { importJWK, jwtVerify } from "jose";
import { APIError } from "../../api";
import type { Client } from "./types";

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
 * Fetch JWKS from a URI
 */
async function fetchJwksFromUri(
	jwksUri: string,
	ctx: GenericEndpointContext,
): Promise<{ keys: unknown[] }> {
	let response: Response;
	try {
		response = await fetch(jwksUri, {
			headers: {
				Accept: "application/json",
			},
		});
	} catch (error) {
		ctx.context.logger.error("Failed to fetch JWKS from URI", {
			jwksUri,
			error,
		});
		throw new APIError("UNAUTHORIZED", {
			error_description: `failed to fetch jwks from uri: ${error instanceof Error ? error.message : "network error"}`,
			error: "invalid_client",
		});
	}

	if (!response.ok) {
		throw new APIError("UNAUTHORIZED", {
			error_description: `failed to fetch jwks from uri: HTTP ${response.status}`,
			error: "invalid_client",
		});
	}

	let jwks: { keys?: unknown[] };
	try {
		jwks = await response.json();
	} catch {
		throw new APIError("UNAUTHORIZED", {
			error_description: "failed to fetch jwks from uri: invalid JSON response",
			error: "invalid_client",
		});
	}

	if (!jwks.keys || !Array.isArray(jwks.keys)) {
		throw new APIError("UNAUTHORIZED", {
			error_description: "failed to fetch jwks from uri: missing keys array",
			error: "invalid_client",
		});
	}

	return { keys: jwks.keys };
}

/**
 * Get JWKS keys from client configuration (inline jwks or jwksUri)
 */
async function getClientJwksKeys(
	client: Client,
	ctx: GenericEndpointContext,
): Promise<JWK[]> {
	// First try inline JWKS
	if (client.jwks) {
		let jwks: { keys?: unknown[] };
		try {
			jwks = JSON.parse(client.jwks);
		} catch {
			throw new APIError("UNAUTHORIZED", {
				error_description: "invalid jwks format: malformed JSON",
				error: "invalid_client",
			});
		}
		if (jwks.keys && Array.isArray(jwks.keys) && jwks.keys.length > 0) {
			return jwks.keys as JWK[];
		}
	}

	// Then try JWKS URI
	if (client.jwksUri) {
		const jwks = await fetchJwksFromUri(client.jwksUri, ctx);
		return jwks.keys as JWK[];
	}

	throw new APIError("UNAUTHORIZED", {
		error_description: "client jwks not configured (neither jwks nor jwks_uri)",
		error: "invalid_client",
	});
}

export async function verifyClientAssertion(params: {
	clientAssertion: string;
	clientId: string;
	client: Client;
	tokenEndpoint: string;
	ctx: GenericEndpointContext;
}): Promise<{ clientId: string; sub: string }> {
	const { clientAssertion, clientId, client, tokenEndpoint, ctx } = params;

	const keys = await getClientJwksKeys(client, ctx);

	if (keys.length === 0) {
		throw new APIError("UNAUTHORIZED", {
			error_description: "no keys found in jwks",
			error: "invalid_client",
		});
	}

	const parts = clientAssertion.split(".");
	if (parts.length !== 3 || !parts[0]) {
		throw new APIError("UNAUTHORIZED", {
			error_description: "invalid jwt format",
			error: "invalid_client",
		});
	}

	let header: unknown;
	try {
		header = JSON.parse(new TextDecoder().decode(base64.decode(parts[0])));
	} catch {
		throw new APIError("UNAUTHORIZED", {
			error_description: "invalid jwt header",
			error: "invalid_client",
		});
	}
	const kid = (header as { kid?: string }).kid;

	let key: JWK = keys[0]!;
	if (kid) {
		const foundKey = keys.find((k) => k.kid === kid);
		if (!foundKey) {
			throw new APIError("UNAUTHORIZED", {
				error_description: "key with specified kid not found",
				error: "invalid_client",
			});
		}
		key = foundKey;
	}

	let publicKey: Awaited<ReturnType<typeof importJWK>>;
	try {
		publicKey = await importJWK(key);
	} catch (err) {
		throw new APIError("UNAUTHORIZED", {
			error_description: `failed to import jwk: ${err instanceof Error ? err.message : "invalid key format"}`,
			error: "invalid_client",
		});
	}

	const { payload } = await jwtVerify(clientAssertion, publicKey, {
		issuer: clientId,
		subject: clientId,
		audience: tokenEndpoint,
	}).catch((err) => {
		throw new APIError("UNAUTHORIZED", {
			error_description: `jwt verification failed: ${err.message}`,
			error: "invalid_client",
		});
	});

	if (!payload.jti) {
		throw new APIError("UNAUTHORIZED", {
			error_description: "jti claim is required",
			error: "invalid_client",
		});
	}

	if (typeof payload.exp !== "number") {
		throw new APIError("UNAUTHORIZED", {
			error_description: "exp claim is required",
			error: "invalid_client",
		});
	}

	const jtiUsed = await checkJtiReplay(
		payload.jti as string,
		payload.exp,
		clientId,
		ctx,
	);

	if (jtiUsed) {
		throw new APIError("UNAUTHORIZED", {
			error_description: "jti has already been used",
			error: "invalid_client",
		});
	}

	return {
		clientId: payload.iss as string,
		sub: payload.sub as string,
	};
}

export async function checkJtiReplay(
	jti: string,
	exp: number,
	clientId: string,
	ctx: GenericEndpointContext,
): Promise<boolean> {
	const existing = await ctx.context.internalAdapter.findVerificationValue(
		`jti:${clientId}:${jti}`,
	);

	if (existing) {
		return true;
	}

	await ctx.context.internalAdapter.createVerificationValue({
		identifier: `jti:${clientId}:${jti}`,
		value: jti,
		expiresAt: new Date(exp * 1000),
	});

	return false;
}
