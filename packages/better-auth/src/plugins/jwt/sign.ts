import { importJWK, SignJWT, type JWTPayload } from "jose";
import type { GenericEndpointContext } from "../../types";
import { BetterAuthError } from "../../error";
import { symmetricDecrypt, symmetricEncrypt } from "../../crypto";
import { generateExportedKeyPair, type JwtOptions } from ".";
import type { Jwk } from "./schema";
import { getJwksAdapter } from "./adapter";

export async function signJWT(
	ctx: GenericEndpointContext,
	config: {
		options?: JwtOptions;
		payload: JWTPayload;
	},
) {
	const { options, payload } = config;
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

	const jwt = await new SignJWT({
		iss: options?.jwt?.issuer ?? ctx.context.options.baseURL!,
		aud: options?.jwt?.audience ?? ctx.context.options.baseURL!,
		...payload,
	})
		.setIssuedAt()
		.setExpirationTime(options?.jwt?.expirationTime ?? "15m")
		.setProtectedHeader({
			alg,
			kid: key.id,
		})
		.sign(privateKey);
	return jwt;
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
