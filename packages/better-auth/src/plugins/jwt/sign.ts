import type { GenericEndpointContext } from "@better-auth/core";
import { BetterAuthError } from "@better-auth/core/error";
import type { JWTPayload } from "jose";
import { importJWK, SignJWT } from "jose";
import { symmetricDecrypt } from "../../crypto";
import { getJwksAdapter } from "./adapter";
import type { Jwk, JwtOptions } from "./types";
import { rotateJwk, toExpJWT } from "./utils";

export async function signJWT(
	ctx: GenericEndpointContext,
	config: {
		options?: JwtOptions | undefined;
		payload: JWTPayload;
	},
) {
	const { options, payload } = config;

	// Iat
	const nowSeconds = Math.floor(Date.now() / 1000);
	const iat = payload.iat;

	// Exp
	let exp = payload.exp;
	const defaultExp = toExpJWT(
		options?.jwt?.expirationTime ?? "15m",
		iat ?? nowSeconds,
	);
	exp = exp ?? defaultExp;

	// Nbf
	const nbf = payload.nbf;

	// Iss
	const iss = payload.iss;
	const defaultIss = options?.jwt?.issuer ?? ctx.context.options.baseURL!;

	// Aud
	const aud = payload.aud;
	const defaultAud = options?.jwt?.audience ?? ctx.context.options.baseURL!;

	// Custom/remote signing function
	if (options?.jwt?.sign) {
		const jwtPayload = {
			...payload,
			iat,
			exp,
			nbf,
			iss: iss ?? defaultIss,
			aud: aud ?? defaultAud,
		};
		return options.jwt.sign(jwtPayload);
	}

	let key: Jwk | undefined;
	if (options?.jwks?.disableAutomaticRotation) {
		const adapter = getJwksAdapter(ctx.context.adapter, options);
		key = await adapter.getLatestKey(ctx);
	} else {
		const result = await rotateJwk(ctx, options);
		key = result.key;
	}

	if (!key) {
		throw new BetterAuthError(
			"No signing key found. Automatic rotation is disabled. Please create a key manually using the /rotate-jwk endpoint or rotateJwk() function.",
		);
	}

	const privateKeyEncryptionEnabled =
		!options?.jwks?.disablePrivateKeyEncryption;

	let privateWebKey = privateKeyEncryptionEnabled
		? await symmetricDecrypt({
				key: ctx.context.secret,
				data: JSON.parse(key.privateKey),
			}).catch(() => {
				throw new BetterAuthError(
					"Failed to decrypt private key. Make sure the secret currently in use is the same as the one used to encrypt the private key. If you are using a different secret, either clean up your JWKS or disable private key encryption.",
				);
			})
		: key.privateKey;
	const alg = key.alg ?? options?.jwks?.keyPairConfig?.alg ?? "EdDSA";
	const privateKey = await importJWK(JSON.parse(privateWebKey), alg);

	const jwt = new SignJWT(payload)
		.setProtectedHeader({
			alg,
			kid: key.id,
		})
		.setExpirationTime(exp)
		.setIssuer(iss ?? defaultIss)
		.setAudience(aud ?? defaultAud);
	if (iat) jwt.setIssuedAt(iat);
	if (payload.sub) jwt.setSubject(payload.sub);
	if (payload.nbf) jwt.setNotBefore(payload.nbf);
	if (payload.jti) jwt.setJti(payload.jti);
	return await jwt.sign(privateKey);
}

export async function getJwtToken(
	ctx: GenericEndpointContext,
	options?: JwtOptions | undefined,
) {
	const payload = !options?.jwt?.definePayload
		? ctx.context.session!.user
		: await options?.jwt.definePayload(ctx.context.session!);

	return await signJWT(ctx, {
		options,
		payload: {
			iat: Math.floor(Date.now() / 1000),
			...payload,
			sub:
				(await options?.jwt?.getSubject?.(ctx.context.session!)) ??
				ctx.context.session!.user.id,
		},
	});
}
