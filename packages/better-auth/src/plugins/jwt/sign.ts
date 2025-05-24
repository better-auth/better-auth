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
import type { JwtOptions } from ".";
import type { Jwk } from "./schema";
import { getJwksAdapter } from "./adapter";

export async function getJwtToken(
	ctx: GenericEndpointContext,
	tknOpts: {
		payload: JWTPayload;
		issuedAt: boolean;
		expirationTime: number | string | Date;
		audience?: string | string[];
		subject?: string;
	},
	options?: JwtOptions,
) {
	const adapter = getJwksAdapter(ctx.context.adapter);

	let key = await adapter.getLatestKey();
	const privateKeyEncryptionEnabled =
		!options?.jwks?.disablePrivateKeyEncryption;

	if (key === undefined) {
		const { publicKey, privateKey } = await generateKeyPair(
			options?.jwks?.keyPairConfig?.alg ?? "EdDSA",
			options?.jwks?.keyPairConfig ?? {
				crv: "Ed25519",
				extractable: true,
			},
		);

		const publicWebKey = await exportJWK(publicKey);
		const privateWebKey = await exportJWK(privateKey);
		const stringifiedPrivateWebKey = JSON.stringify(privateWebKey);

		let jwk: Partial<Jwk> = {
			publicKey: JSON.stringify(publicWebKey),
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

	const privateKey = await importJWK(
		JSON.parse(privateWebKey),
		options?.jwks?.keyPairConfig?.alg ?? "EdDSA",
	);

	let jwt = new SignJWT(tknOpts.payload)
		.setProtectedHeader({
			alg: options?.jwks?.keyPairConfig?.alg ?? "EdDSA",
			kid: key.id,
		})
		.setExpirationTime(tknOpts.expirationTime)
		.setIssuer(options?.jwt?.issuer ?? ctx.context.options.baseURL!);

	if (tknOpts.issuedAt) {
		jwt = jwt.setIssuedAt();
	}

	if (tknOpts.audience) {
		jwt = jwt.setAudience(tknOpts.audience);
	}

	if (tknOpts.audience) {
		jwt = jwt.setAudience(tknOpts.audience);
	}

	return await jwt.sign(privateKey);
}
