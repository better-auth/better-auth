import type {
	BetterAuthOptions,
	GenericEndpointContext,
} from "@better-auth/core";
import { BetterAuthError } from "@better-auth/core/error";
import type { JSONWebKeySet, JWTPayload } from "jose";
import { decodeProtectedHeader, importJWK, jwtVerify, SignJWT } from "jose";
import { symmetricDecrypt } from "../../crypto";
import { getJwksAdapter } from "./adapter";
import type { JwtOptions } from "./types";
import { createJwk } from "./utils";

type CookieCacheKeySource = "secret" | "jwks";

export function getCookieCacheJwtKeySource(
	options:
		| Pick<BetterAuthOptions, "session">
		| {
				session?:
					| {
							cookieCache?:
								| {
										jwt?:
											| {
													keySource?: CookieCacheKeySource;
											  }
											| undefined;
								  }
								| undefined;
					  }
					| undefined;
		  }
		| undefined,
): CookieCacheKeySource {
	const cookieCache = options?.session?.cookieCache as
		| {
				jwt?:
					| {
							keySource?: CookieCacheKeySource;
					  }
					| undefined;
		  }
		| undefined;
	return cookieCache?.jwt?.keySource ?? "secret";
}

function getJwtPluginOptions(ctx: GenericEndpointContext): JwtOptions {
	const plugin = ctx.context.getPlugin?.("jwt");
	if (!plugin) {
		throw new BetterAuthError(
			'`session.cookieCache.jwt.keySource = "jwks"` requires the `jwt()` plugin to be installed.',
		);
	}
	const options = (plugin.options ?? {}) as JwtOptions;
	if (options.jwt?.sign) {
		throw new BetterAuthError(
			"Cookie-cache JWT JWKS mode does not support `jwt({ jwt: { sign } })`. Use locally managed JWKS keys instead.",
		);
	}
	return options;
}

async function importLocalPublicKey(
	ctx: GenericEndpointContext,
	token: string,
	options: JwtOptions,
) {
	const header = decodeProtectedHeader(token);
	const kid = header.kid;
	if (!kid) {
		ctx.context.logger.debug("Cookie-cache JWT missing kid in header");
		return null;
	}

	const adapter = getJwksAdapter(ctx.context.adapter, options);
	const keys = await adapter.getAllKeys(ctx);
	if (!keys?.length) {
		ctx.context.logger.debug("No JWKS keys available for cookie-cache JWT");
		return null;
	}

	const key = keys.find((entry) => entry.id === kid);
	if (!key) {
		ctx.context.logger.debug(
			`No JWKS key found for cookie-cache JWT kid: ${kid}`,
		);
		return null;
	}

	const alg =
		key.alg ??
		options.jwks?.keyPairConfig?.alg ??
		(header.alg as string | undefined);
	if (!alg) {
		ctx.context.logger.debug(
			`No JWT algorithm available for cookie-cache JWT kid: ${kid}`,
		);
		return null;
	}

	return importJWK(JSON.parse(key.publicKey), alg);
}

export async function signCookieCacheJWT<T extends Record<string, any>>(
	ctx: GenericEndpointContext,
	payload: T,
	expiresIn: number,
): Promise<string> {
	const options = getJwtPluginOptions(ctx);
	const adapter = getJwksAdapter(ctx.context.adapter, options);
	let key = await adapter.getLatestKey(ctx);
	if (!key || (key.expiresAt && key.expiresAt < new Date())) {
		key = await createJwk(ctx, options);
	}

	const privateKeyEncryptionEnabled =
		!options.jwks?.disablePrivateKeyEncryption;
	const privateWebKey = privateKeyEncryptionEnabled
		? await symmetricDecrypt({
				key: ctx.context.secretConfig,
				data: JSON.parse(key.privateKey),
			}).catch(() => {
				throw new BetterAuthError(
					"Failed to decrypt private key for cookie-cache JWT signing. Make sure the current secret can decrypt your JWKS private key material.",
				);
			})
		: key.privateKey;

	const alg = key.alg ?? options.jwks?.keyPairConfig?.alg ?? "EdDSA";
	const privateKey = await importJWK(JSON.parse(privateWebKey), alg);

	return await new SignJWT(payload)
		.setProtectedHeader({
			alg,
			kid: key.id,
		})
		.setIssuedAt()
		.setExpirationTime(Math.floor(Date.now() / 1000) + expiresIn)
		.sign(privateKey);
}

export async function verifyCookieCacheJWT<T = JWTPayload>(
	ctx: GenericEndpointContext,
	token: string,
): Promise<T | null> {
	try {
		const options = getJwtPluginOptions(ctx);
		const publicKey = await importLocalPublicKey(ctx, token, options);
		if (!publicKey) {
			return null;
		}

		const { payload } = await jwtVerify(token, publicKey, {
			clockTolerance: 15,
		});

		return payload as T;
	} catch (error) {
		ctx.context.logger.debug("Cookie-cache JWT verification failed", error);
		return null;
	}
}

export async function verifyCookieCacheJWTWithJWKS<T = JWTPayload>(
	token: string,
	jwks: JSONWebKeySet,
): Promise<T | null> {
	try {
		const header = decodeProtectedHeader(token);
		const kid = header.kid;
		if (!kid) {
			return null;
		}

		const key = jwks.keys.find((entry) => entry.kid === kid);
		if (!key) {
			return null;
		}

		const alg = key.alg ?? (header.alg as string | undefined);
		if (!alg) {
			return null;
		}

		const publicKey = await importJWK(key, alg);
		const { payload } = await jwtVerify(token, publicKey, {
			clockTolerance: 15,
		});
		return payload as T;
	} catch {
		return null;
	}
}
