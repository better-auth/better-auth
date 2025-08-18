import type {
	BetterAuthPlugin,
	InferOptionSchema,
	Session,
	User,
} from "../../types";
import { type Jwk, schema } from "./schema";
import { getJwksAdapter } from "./adapter";
import { getJwtToken, signJWT } from "./sign";
import { exportJWK, generateKeyPair, type JWK, type JWTPayload } from "jose";
import {
	APIError,
	createAuthEndpoint,
	createAuthMiddleware,
	sessionMiddleware,
} from "../../api";
import { symmetricEncrypt } from "../../crypto";
import { mergeSchema } from "../../db/schema";
import z from "zod";
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
		 * Disables the /jwks endpoint and uses this endpoint in discovery.
		 *
		 * Useful if jwks are not managed at /jwks or
		 * if your jwks are signed with a certificate and placed on your CDN.
		 */
		remoteUrl?: string;

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
	 * Disables setting JWTs through middleware.
	 *
	 * Recommended to set `true` when using an oAuth provider plugin
	 * like OIDC or MCP where session payloads should not be signed.
	 *
	 * @default false
	 */
	disableSettingJwtHeader?: boolean;

	/**
	 * Custom schema for the admin plugin
	 */
	schema?: InferOptionSchema<typeof schema>;
}

export async function generateExportedKeyPair(
	options?: JwtOptions,
): Promise<{ publicWebKey: JWK; privateWebKey: JWK }> {
	const { alg, ...cfg } = options?.jwks?.keyPairConfig ?? {
		alg: "EdDSA",
		crv: "Ed25519",
	};
	const keyPairConfig = {
		...cfg,
		extractable: true,
	};

	const { publicKey, privateKey } = await generateKeyPair(alg, keyPairConfig);

	const publicWebKey = await exportJWK(publicKey);
	const privateWebKey = await exportJWK(privateKey);

	return { publicWebKey, privateWebKey };
}

export const jwt = (options?: JwtOptions) => {
	// Alg is required to be specified when using remote url (needed in openid metadata)
	if (options?.jwks?.remoteUrl && !options.jwks?.keyPairConfig?.alg) {
		throw new BetterAuthError(
			"jwks_config",
			"must specify alg when using the oidc plugin and jwks.remoteUrl",
		);
	}

	return {
		id: "jwt",
		options,
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
					// Disables endpoint if using remote url strategy
					if (options?.jwks?.remoteUrl) {
						throw new APIError("NOT_FOUND");
					}

					const adapter = getJwksAdapter(ctx.context.adapter);

					const keySets = await adapter.getAllKeys();

					if (keySets.length === 0) {
						const { alg, ...cfg } = options?.jwks?.keyPairConfig ?? {
							alg: "EdDSA",
							crv: "Ed25519",
						};
						const keyPairConfig = {
							...cfg,
							extractable: true,
						};

						const { publicKey, privateKey } = await generateKeyPair(
							alg,
							keyPairConfig,
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
			signJWT: createAuthEndpoint(
				"/sign-jwt",
				{
					method: "POST",
					metadata: {
						SERVER_ONLY: true,
						$Infer: {
							body: {} as {
								payload: JWTPayload;
								overrideOptions?: JwtOptions;
							},
						},
					},
					body: z.object({
						payload: z.record(z.string(), z.any()),
						overrideOptions: z.record(z.string(), z.any()).optional(),
					}),
				},
				async (c) => {
					const jwt = await signJWT(c, {
						options: {
							...options,
							...c.body.overrideOptions,
						},
						payload: c.body.payload,
					});
					return c.json({ token: jwt });
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
						if (options?.disableSettingJwtHeader) {
							return;
						}

						const session = ctx.context.session || ctx.context.newSession;
						if (session && session.session) {
							const jwt = await getJwtToken(ctx, options);
							const exposedHeaders =
								ctx.context.responseHeaders?.get(
									"access-control-expose-headers",
								) || "";
							const headersSet = new Set(
								exposedHeaders
									.split(",")
									.map((header) => header.trim())
									.filter(Boolean),
							);
							headersSet.add("set-auth-jwt");
							ctx.setHeader("set-auth-jwt", jwt);
							ctx.setHeader(
								"Access-Control-Expose-Headers",
								Array.from(headersSet).join(", "),
							);
						}
					}),
				},
			],
		},
		schema: mergeSchema(schema, options?.schema),
	} satisfies BetterAuthPlugin;
};

export { getJwtToken };
