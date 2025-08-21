import { importJWK, SignJWT, type JWTPayload } from "jose";
import type { GenericEndpointContext } from "../../types";
import { BetterAuthError } from "../../error";
import { symmetricDecrypt, symmetricEncrypt } from "../../crypto";
import { generateExportedKeyPair, type JwtOptions } from ".";
import type { Jwk } from "./schema";
import { getJwksAdapter } from "./adapter";
import { toExpJWT } from "./utils";

export async function signJWT(
	ctx: GenericEndpointContext,
	config: {
		options?: JwtOptions;
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

	const adapter = getJwksAdapter(ctx.context.adapter);
	let key = await adapter.getLatestKey();
	const privateKeyEncryptionEnabled =
		!options?.jwks?.disablePrivateKeyEncryption;

	if (key === undefined) {
		const alg = options?.jwks?.keyPairConfig?.alg || "EdDSA";

		const { publicWebKey, privateWebKey } =
			await generateExportedKeyPair(options);
		const stringifiedPrivateWebKey = JSON.stringify(privateWebKey);

		let jwk: Partial<Jwk> = {
			publicKey: JSON.stringify({ alg, ...publicWebKey }),
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

		key = await adapter.createJwk(jwk as Jwk);
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
	const alg = options?.jwks?.keyPairConfig?.alg ?? "EdDSA";
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
	options?: JwtOptions,
) {
	const payload = !options?.jwt?.definePayload
		? ctx.context.session!.user
		: await options?.jwt.definePayload(ctx.context.session!);

	return await signJWT(ctx, {
		options,
		payload: {
			...payload,
			sub:
				(await options?.jwt?.getSubject?.(ctx.context.session!)) ??
				ctx.context.session!.user.id,
		},
	});
}
