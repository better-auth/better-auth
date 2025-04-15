import type {
	BetterAuthPlugin,
	GenericEndpointContext,
	InferOptionSchema,
	Session,
	User,
} from "../../types";
import { type Jwk, schema } from "./schema";
import { getJwksAdapter } from "./adapter";
import { exportJWK, generateKeyPair, importJWK, SignJWT } from "jose";
import {
	createAuthEndpoint,
	createAuthMiddleware,
	sessionMiddleware,
} from "../../api";
import { symmetricDecrypt, symmetricEncrypt } from "../../crypto";
import { mergeSchema } from "../../db/schema";
import { BetterAuthError } from "../../error";

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
		/**
		 * The issuer of the JWT
		 */
		issuer?: string;
		/**
		 * The audience of the JWT
		 */
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
		/**
		 * A function that is called to define the payload of the JWT
		 */
		definePayload?: (session: {
			user: User & Record<string, any>;
			session: Session & Record<string, any>;
		}) => Promise<Record<string, any>> | Record<string, any>;
		/**
		 * A function that is called to get the subject of the JWT
		 *
		 * @default session.user.id
		 */
		getSubject?: (session: {
			user: User & Record<string, any>;
			session: Session & Record<string, any>;
		}) => Promise<string> | string;
	};
	/**
	 * Custom schema for the admin plugin
	 */
	schema?: InferOptionSchema<typeof schema>;
}

export async function getJwtToken(
	ctx: GenericEndpointContext,
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

	const payload = !options?.jwt?.definePayload
		? ctx.context.session!.user
		: await options?.jwt.definePayload(ctx.context.session!);

	const jwt = await new SignJWT(payload)
		.setProtectedHeader({
			alg: options?.jwks?.keyPairConfig?.alg ?? "EdDSA",
			kid: key.id,
		})
		.setIssuedAt()
		.setIssuer(options?.jwt?.issuer ?? ctx.context.options.baseURL!)
		.setAudience(options?.jwt?.audience ?? ctx.context.options.baseURL!)
		.setExpirationTime(options?.jwt?.expirationTime ?? "15m")
		.setSubject(
			(await options?.jwt?.getSubject?.(ctx.context.session!)) ??
				ctx.context.session!.user.id,
		)
		.sign(privateKey);
	return jwt;
}
export const jwt = (options?: JwtOptions) => {
	return {
		id: "jwt",
		endpoints: {
			getJwks: createAuthEndpoint(
				"/jwks",
				{
					method: "GET",
					metadata: {
						openapi: {
							description: "Get the JSON Web Key Set",
							responses: {
								"200": {
									description: "JSON Web Key Set retrieved successfully",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													keys: {
														type: "array",
														description: "Array of public JSON Web Keys",
														items: {
															type: "object",
															properties: {
																kid: {
																	type: "string",
																	description:
																		"Key ID uniquely identifying the key, corresponds to the 'id' from the stored Jwk",
																},
																kty: {
																	type: "string",
																	description:
																		"Key type (e.g., 'RSA', 'EC', 'OKP')",
																},
																alg: {
																	type: "string",
																	description:
																		"Algorithm intended for use with the key (e.g., 'EdDSA', 'RS256')",
																},
																use: {
																	type: "string",
																	description:
																		"Intended use of the public key (e.g., 'sig' for signature)",
																	enum: ["sig"],
																	nullable: true,
																},
																n: {
																	type: "string",
																	description:
																		"Modulus for RSA keys (base64url-encoded)",
																	nullable: true,
																},
																e: {
																	type: "string",
																	description:
																		"Exponent for RSA keys (base64url-encoded)",
																	nullable: true,
																},
																crv: {
																	type: "string",
																	description:
																		"Curve name for elliptic curve keys (e.g., 'Ed25519', 'P-256')",
																	nullable: true,
																},
																x: {
																	type: "string",
																	description:
																		"X coordinate for elliptic curve keys (base64url-encoded)",
																	nullable: true,
																},
																y: {
																	type: "string",
																	description:
																		"Y coordinate for elliptic curve keys (base64url-encoded)",
																	nullable: true,
																},
															},
															required: ["kid", "kty", "alg"],
														},
													},
												},
												required: ["keys"],
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const adapter = getJwksAdapter(ctx.context.adapter);

					const keySets = await adapter.getAllKeys();

					if (keySets.length === 0) {
						const alg = options?.jwks?.keyPairConfig?.alg ?? "EdDSA";
						const { publicKey, privateKey } = await generateKeyPair(
							alg,
							options?.jwks?.keyPairConfig ?? {
								crv: "Ed25519",
								extractable: true,
							},
						);

						const publicWebKey = await exportJWK(publicKey);
						const privateWebKey = await exportJWK(privateKey);
						const stringifiedPrivateWebKey = JSON.stringify(privateWebKey);
						const privateKeyEncryptionEnabled =
							!options?.jwks?.disablePrivateKeyEncryption;
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

						await adapter.createJwk(jwk as Jwk);

						return ctx.json({
							keys: [
								{
									...publicWebKey,
									alg,
									kid: jwk.id,
								},
							],
						});
					}

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
					metadata: {
						openapi: {
							description: "Get a JWT token",
							responses: {
								200: {
									description: "Success",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													token: {
														type: "string",
													},
												},
											},
										},
									},
								},
							},
						},
					},
				},
				async (ctx) => {
					const jwt = await getJwtToken(ctx, options);
					return ctx.json({
						token: jwt,
					});
				},
			),
		},
		hooks: {
			after: [
				{
					matcher(context) {
						return context.path === "/get-session";
					},
					handler: createAuthMiddleware(async (ctx) => {
						const session = ctx.context.session || ctx.context.newSession;
						if (session && session.session) {
							const jwt = await getJwtToken(ctx, options);
							ctx.setHeader("set-auth-jwt", jwt);
							ctx.setHeader("Access-Control-Expose-Headers", "set-auth-jwt");
						}
					}),
				},
			],
		},
		schema: mergeSchema(schema, options?.schema),
	} satisfies BetterAuthPlugin;
};
