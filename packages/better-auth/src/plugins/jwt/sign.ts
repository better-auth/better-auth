import {
	importJWK,
	exportJWK,
	generateKeyPair,
	SignJWT,
	type JWTPayload,
} from "jose";
import type { GenericEndpointContext } from "../../types";
import { BetterAuthError } from "../../error";
import { symmetricDecrypt, symmetricEncrypt } from "../../crypto";
import type { Jwk } from "./schema";
import { getJwksAdapter } from "./adapter";
import type { JwtPluginOptions } from "./types";
import { getJwtPlugin } from "./utils";

/**
 * Signs a payload in jwt format
 *
 * @param ctx - endpoint context
 * @param payload - payload to sign
 * @param options - Jwt signing options. If not provided, uses the jwtPlugin options
 */
export async function signJwt(
	ctx: GenericEndpointContext,
	payload: JWTPayload,
	options?: JwtPluginOptions,
) {
	if (!options) {
		options = getJwtPlugin(ctx.context).options;
	}

	// Custom/remote signing function
	if (options?.jwt?.sign && payload) {
		return options.jwt.sign(payload);
	}

	const adapter = getJwksAdapter(ctx.context.adapter);

	let key = await adapter.getLatestKey();
	const privateKeyEncryptionEnabled =
		!options?.jwks?.disablePrivateKeyEncryption;

	if (key === undefined) {
		key = await createJwk(ctx, options);
	}

	let privateWebKey = privateKeyEncryptionEnabled
		? await symmetricDecrypt({
				key: ctx.context.secret,
				data: JSON.parse(key.privateKey),
			}).catch(() => {
				throw new BetterAuthError(
					"Failed to decrypt private private key. Make sure the secret currently in use is the same as the one used to encrypt the private key. If you are using a different secret, either cleanup your jwks or disable private key encryption.",
				);
			})
		: key.privateKey;

	const privateKey = await importJWK(
		JSON.parse(privateWebKey),
		options?.jwks?.keyPairConfig?.alg ?? "EdDSA",
	);

	const jwt = new SignJWT(payload)
		.setProtectedHeader({
			alg: options?.jwks?.keyPairConfig?.alg ?? "EdDSA",
			kid: key.id,
			typ: "JWT",
		})
		.setIssuedAt(payload.iat)
		.setIssuer(
			payload.iss ?? options?.jwt?.issuer ?? ctx.context.options.baseURL!,
		)
		.setAudience(
			payload.aud ?? options?.jwt?.audience ?? ctx.context.options.baseURL!,
		)
		.setExpirationTime(payload.exp ?? options?.jwt?.expirationTime ?? "15m");
	const sub =
		(await options?.jwt?.getSubject?.(ctx.context.session!)) ??
		payload.sub ??
		ctx.context.session?.user.id;
	if (sub) jwt.setSubject(sub);
	return await jwt.sign(privateKey);
}

/**
 * Backwards compatable version of signJwt
 *
 * @deprecated - prefer signJwt
 *
 * @param ctx - endpoint context
 * @param options - Jwt signing options. If not provided, uses the jwtPlugin options
 */
export async function getJwtToken(
	ctx: GenericEndpointContext,
	options?: JwtPluginOptions,
) {
	if (!options) {
		options = getJwtPlugin(ctx.context).options;
	}

	const payload = !options?.jwt?.definePayload
		? ctx.context.session!.user
		: await options?.jwt.definePayload(ctx.context.session!);

	return await signJwt(ctx, payload, options);
}

export async function generateExportedKeyPair(options?: JwtPluginOptions) {
	const { publicKey, privateKey } = await generateKeyPair(
		options?.jwks?.keyPairConfig?.alg ?? "EdDSA",
		{
			...options?.jwks?.keyPairConfig,
			extractable: true,
		},
	);

	const publicWebKey = await exportJWK(publicKey);
	const privateWebKey = await exportJWK(privateKey);

	return { publicWebKey, privateWebKey };
}

/**
 * Creates a new JWK (JSON Web Key) on the database.
 */
export async function createJwk(
	ctx: GenericEndpointContext,
	options?: JwtPluginOptions,
) {
	if (!options) {
		options = getJwtPlugin(ctx.context).options;
	}

	const { publicWebKey, privateWebKey } =
		await generateExportedKeyPair(options);
	const stringifiedPrivateWebKey = JSON.stringify(privateWebKey);
	const privateKeyEncryptionEnabled =
		!options?.jwks?.disablePrivateKeyEncryption;

	let jwk: Partial<Jwk> = {
		publicKey: JSON.stringify({
			alg: options?.jwks?.keyPairConfig?.alg ?? "EdDSA",
			...publicWebKey,
		}),
		privateKey: privateKeyEncryptionEnabled
			? JSON.stringify(
					await symmetricEncrypt({
						key: ctx.context.secret,
						data: stringifiedPrivateWebKey,
					}),
				)
			: stringifiedPrivateWebKey,
		createdAt: new Date(),
	};

	const adapter = getJwksAdapter(ctx.context.adapter);
	const key = await adapter.createJwk(jwk as Jwk);

	return key;
}
