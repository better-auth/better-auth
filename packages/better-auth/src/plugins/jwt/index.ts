import type { BetterAuthPlugin, User } from "../../types";
import { type Jwk, schema } from "./schema";
import { getJwksAdapter } from "./adapter";
import { exportJWK, generateKeyPair, importJWK, SignJWT } from "jose";
import { createAuthEndpoint, sessionMiddleware } from "../../api";
import { symmetricDecrypt, symmetricEncrypt } from "../../crypto";

type JWKOptions =
	| {
			alg: "EdDSA"; // EdDSA with either Ed25519 or Ed448 curve
			crv?: "Ed25519" | "Ed448";
	  }
	| {
			alg: "ES256"; // ECDSA with P-256 curve
			crv?: never; // Only one valid option, no need for crv
	  }
	| {
			alg: "RS256"; // RSA with SHA-256
			modulusLength?: number; // Default to 2048 or higher
	  }
	| {
			alg: "PS256"; // RSA-PSS with SHA-256
			modulusLength?: number; // Default to 2048 or higher
	  }
	| {
			alg: "ECDH-ES"; // Key agreement algorithm with P-256 as default curve
			crv?: "P-256" | "P-384" | "P-521";
	  }
	| {
			alg: "ES512"; // ECDSA with P-521 curve
			crv?: never; // Only P-521 for ES512
	  };

export interface JwtOptions {
	jwks?: {
		/**
		 * Key pair configuration
		 * @description A subset of the options available for the generateKeyPair function
		 *
		 * @see https://github.com/panva/jose/blob/main/src/runtime/node/generate.ts
		 *
		 * @default { alg: 'EdDSA', crv: 'Ed25519' }
		 */
		keyPairConfig?: JWKOptions;

		/**
		 * Disable private key encryption
		 * @description Disable the encryption of the private key in the database
		 *
		 * @default false
		 */
		disablePrivateKeyEncryption?: boolean;
	};

	jwt?: {
		issuer?: string;
		audience?: string;
		/**
		 * Set the "exp" (Expiration Time) Claim.
		 *
		 * - If a `number` is passed as an argument it is used as the claim directly.
		 * - If a `Date` instance is passed as an argument it is converted to unix timestamp and used as the
		 *   claim.
		 * - If a `string` is passed as an argument it is resolved to a time span, and then added to the
		 *   current unix timestamp and used as the claim.
		 *
		 * Format used for time span should be a number followed by a unit, such as "5 minutes" or "1
		 * day".
		 *
		 * Valid units are: "sec", "secs", "second", "seconds", "s", "minute", "minutes", "min", "mins",
		 * "m", "hour", "hours", "hr", "hrs", "h", "day", "days", "d", "week", "weeks", "w", "year",
		 * "years", "yr", "yrs", and "y". It is not possible to specify months. 365.25 days is used as an
		 * alias for a year.
		 *
		 * If the string is suffixed with "ago", or prefixed with a "-", the resulting time span gets
		 * subtracted from the current unix timestamp. A "from now" suffix can also be used for
		 * readability when adding to the current unix timestamp.
		 *
		 * @default 15m
		 */
		expirationTime?: number | string | Date;
		definePayload?: (
			user: User,
		) => Promise<Record<string, any>> | Record<string, any>;
	};
}

export const jwt = (options?: JwtOptions) => {
	return {
		id: "jwt",
		endpoints: {
			getJwks: createAuthEndpoint(
				"/jwks",
				{
					method: "GET",
				},
				async (ctx) => {
					const adapter = getJwksAdapter(ctx.context.adapter);

					const keySets = await adapter.getAllKeys();

					return ctx.json({
						keys: keySets.map((keySet) => ({
							...JSON.parse(keySet.publicKey),
							kid: keySet.id,
						})),
					});
				},
			),

			getToken: createAuthEndpoint(
				"/token",
				{
					method: "GET",
					requireHeaders: true,
					use: [sessionMiddleware],
				},
				async (ctx) => {
					const adapter = getJwksAdapter(ctx.context.adapter);

					let key = await adapter.getLatestKey();
					const privateKeyEncryptionEnabled =
						!options?.jwks?.disablePrivateKeyEncryption;

					if (key === undefined) {
						const { publicKey, privateKey } = await generateKeyPair(
							options?.jwks?.keyPairConfig?.alg ?? "EdDSA",
							options?.jwks?.keyPairConfig ?? { crv: "Ed25519" },
						);

						const publicWebKey = await exportJWK(publicKey);
						const privateWebKey = await exportJWK(privateKey);
						const stringifiedPrivateWebKey = JSON.stringify(privateWebKey);

						let jwk: Partial<Jwk> = {
							id: crypto.randomUUID(),
							publicKey: JSON.stringify(publicWebKey),
							privateKey: privateKeyEncryptionEnabled
								? JSON.stringify(
										await symmetricEncrypt({
											key: ctx.context.options.secret!,
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
								key: ctx.context.options.secret!,
								data: JSON.parse(key.privateKey),
							})
						: key.privateKey;

					const privateKey = await importJWK(JSON.parse(privateWebKey));

					const payload = !options?.jwt?.definePayload
						? ctx.context.session.user
						: await options?.jwt.definePayload(ctx.context.session.user);

					const jwt = await new SignJWT({
						...payload,
						// I am aware that this is not the best way to handle this, but this is the only way I know to get the impersonatedBy field
						...((ctx.context.session.session as any).impersonatedBy!
							? {
									impersonatedBy: (ctx.context.session.session as any)
										.impersonatedBy,
								}
							: {}),
					})
						.setProtectedHeader({
							alg: options?.jwks?.keyPairConfig?.alg ?? "EdDSA",
							kid: key.id,
						})
						.setIssuedAt()
						.setIssuer(options?.jwt?.issuer ?? ctx.context.options.baseURL!)
						.setAudience(options?.jwt?.audience ?? ctx.context.options.baseURL!)
						.setExpirationTime(options?.jwt?.expirationTime ?? "15m")
						.setSubject(ctx.context.session.user.id)
						.sign(privateKey);

					return ctx.json({
						token: jwt,
					});
				},
			),
		},
		schema,
	} satisfies BetterAuthPlugin;
};
