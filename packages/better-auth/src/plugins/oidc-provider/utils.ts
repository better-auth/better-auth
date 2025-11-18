import type { GenericEndpointContext } from "@better-auth/core";
import { base64, base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
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

export async function verifyClientAssertion(params: {
	clientAssertion: string;
	clientId: string;
	client: Client;
	tokenEndpoint: string;
	ctx: GenericEndpointContext;
}): Promise<{ clientId: string; sub: string }> {
	const { clientAssertion, clientId, client, tokenEndpoint, ctx } = params;

	if (!client.jwks) {
		throw new APIError("UNAUTHORIZED", {
			error_description: "client jwks not configured",
			error: "invalid_client",
		});
	}

	const jwks = JSON.parse(client.jwks);
	const keys = jwks.keys;

	if (!keys || !Array.isArray(keys) || keys.length === 0) {
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

	const header = JSON.parse(new TextDecoder().decode(base64.decode(parts[0])));
	const kid = header.kid;

	let key = keys[0];
	if (kid) {
		const foundKey = keys.find((k: any) => k.kid === kid);
		if (!foundKey) {
			throw new APIError("UNAUTHORIZED", {
				error_description: "key with specified kid not found",
				error: "invalid_client",
			});
		}
		key = foundKey;
	}

	const publicKey = await importJWK(key);

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
