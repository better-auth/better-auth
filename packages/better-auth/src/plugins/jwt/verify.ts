import type { GenericEndpointContext } from "@better-auth/core";
import { getCurrentAuthContext } from "@better-auth/core/context";
import { base64 } from "@better-auth/utils/base64";
import type { JWTPayload } from "jose";
import { importJWK, jwtVerify } from "jose";
import { symmetricDecrypt } from "../../crypto";
import { getJwksAdapter } from "./adapter";
import type { JwtOptions } from "./types";

/**
 * Verify a JWT token using the JWKS public keys
 * Returns the payload if valid, null otherwise
 */
export async function verifyJWT<T extends JWTPayload = JWTPayload>(
	token: string,
	options?: JwtOptions,
): Promise<(T & Required<Pick<JWTPayload, "sub" | "aud">>) | null> {
	const ctx = await getCurrentAuthContext();
	try {
		const parts = token.split(".");
		if (parts.length !== 3) {
			return null;
		}

		const headerStr = new TextDecoder().decode(base64.decode(parts[0]!));
		const header = JSON.parse(headerStr);
		const kid = header.kid;

		if (!kid) {
			ctx.context.logger.debug("JWT missing kid in header");
			return null;
		}

		// Get all JWKS keys
		const adapter = getJwksAdapter(ctx.context.adapter, options);
		const keys = await adapter.getAllKeys(ctx as GenericEndpointContext);

		if (!keys || keys.length === 0) {
			ctx.context.logger.debug("No JWKS keys available");
			return null;
		}

		const key = keys.find((k) => k.id === kid);
		if (!key) {
			ctx.context.logger.debug(`No JWKS key found for kid: ${kid}`);
			return null;
		}

		const alg = key.alg ?? options?.jwks?.keyPairConfig?.alg ?? "EdDSA";

		let cryptoKey;
		if (alg === "HS256") {
			// For HS256, we need to use the secret key (stored as privateKey)
			const privateKeyEncryptionEnabled =
				!options?.jwks?.disablePrivateKeyEncryption;
			let secretWebKey = privateKeyEncryptionEnabled
				? await symmetricDecrypt({
						key: ctx.context.secret,
						data: JSON.parse(key.privateKey),
					}).catch(() => null)
				: key.privateKey;

			if (!secretWebKey) {
				ctx.context.logger.debug("Failed to decrypt HS256 secret key");
				return null;
			}
			cryptoKey = await importJWK(JSON.parse(secretWebKey), alg);
		} else {
			const publicKey = JSON.parse(key.publicKey);
			cryptoKey = await importJWK(publicKey, alg);
		}

		const { payload } = await jwtVerify(token, cryptoKey, {
			issuer: options?.jwt?.issuer ?? ctx.context.options.baseURL,
			audience: options?.jwt?.audience ?? ctx.context.options.baseURL,
		});

		if (!payload.sub || !payload.aud) {
			return null;
		}

		return payload as T & Required<Pick<JWTPayload, "sub" | "aud">>;
	} catch (error) {
		ctx.context.logger.debug("JWT verification failed", error);
		return null;
	}
}
