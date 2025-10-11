import type { BetterAuthPlugin } from "@better-auth/core";
import {
	jwtCustomClaimsSchema,
	jwkExportedSchema,
	jwkOptionsSchema,
	JwtVerifyOptionsSchema,
	type JwtCustomClaims,
	type JwkOptions,
	type JwtPluginOptions,
	type JwtVerifyOptions,
} from "./types";
import { schema } from "./schema";
import { getJwksAdapter } from "./adapter";
import {
	createAuthEndpoint,
	createAuthMiddleware,
} from "@better-auth/core/middleware";
import { mergeSchema } from "../../db/schema";
import {
	createJwkInternal,
	getAllJwksInternal,
	getCachedDatabaseKeys,
	getCachedJwks,
	getJwksInternal,
	importJwkInternal,
	invalidateCachedJwks,
	revokeJwk,
} from "./jwk";
import { getSessionJwtInternal, signJwtInternal } from "./sign";
import { verifyJwtInternal, verifyJwtWithKeyInternal } from "./verify";
import { type JSONWebKeySet, type JWK, type JWTPayload } from "jose";
import * as z from "zod/v4";
import { parseJwk } from "./utils";
import { BetterAuthError } from "@better-auth/core/error";
import { JWTExpired } from "jose/errors";
import { APIError, sessionMiddleware } from "../../api";
export type * from "./types";
export { createJwk, getJwk, getJwks, getAllJwks, importJwk } from "./jwk";
export { getSessionJwt, signJwt } from "./sign";
export { verifyJwt, verifyJwtWithKey } from "./verify";

export const jwt = (pluginOpts?: JwtPluginOptions) => {
	return {
		id: "jwt",
		async init(ctx) {
			invalidateCachedJwks();
			try {
				const adapter = getJwksAdapter(ctx.adapter);
				await adapter.updateKeysEncryption(
					ctx.secret,
					pluginOpts?.jwks?.disablePrivateKeyEncryption ?? false,
				);
			} catch {}
		},
		options: pluginOpts,
		endpoints: {
			getJwks: createAuthEndpoint(
				"/jwks",
				{
					method: "GET",
					metadata: {
						openapi: {
							description: "Get the JSON Web Key Set without remote keys",
							responses: {
								200: {
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
					const jwks = pluginOpts?.jwks?.disableJwksCaching
						? await getJwksInternal(ctx, pluginOpts)
						: await getCachedDatabaseKeys(ctx, pluginOpts);
					const keyPairConfig = pluginOpts?.jwks?.keyPairConfig;
					const defaultCrv = keyPairConfig
						? "crv" in keyPairConfig
							? (keyPairConfig as { crv: string }).crv
							: undefined
						: undefined;

					return ctx.json({
						keys: jwks.map((keySet) => {
							const publicKey =
								typeof keySet.publicKey === "string"
									? JSON.parse(keySet.publicKey)
									: keySet.publicKey;
							return {
								alg: publicKey.alg ?? keyPairConfig?.alg ?? "EdDSA",
								crv: publicKey.crv ?? defaultCrv,
								...publicKey,
								kid: keySet.id,
							} satisfies JWK as JWK;
						}),
					} satisfies JSONWebKeySet as JSONWebKeySet);
				},
			),
			getAllJwks: createAuthEndpoint(
				"/jwks-all",
				{
					method: "GET",
					metadata: {
						openapi: {
							description: "Get the JSON Web Key Set with remote keys included",
							responses: {
								200: {
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
					return ctx.json(
						pluginOpts?.jwks?.disableJwksCaching
							? getAllJwksInternal(ctx, pluginOpts)
							: getCachedJwks(ctx, pluginOpts),
					);
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
					const jwt = await getSessionJwtInternal(ctx, pluginOpts);
					return ctx.json({
						token: jwt,
					});
				},
			),
			verifyJwt: createAuthEndpoint(
				"/verify-jwt",
				{
					method: "POST",
					body: z.object({
						jwt: z.string().meta({
							description: "Signed JWT to verify",
						}),
						jwk: jwkExportedSchema.or(z.string()).optional(),
						options: JwtVerifyOptionsSchema.optional(),
						logFailure: z.boolean().optional(),
					}),
					metadata: {
						SERVER_ONLY: true,
						$Infer: {
							body: {} as {
								jwt: string;
								jwk?: string | JWK;
								options?: JwtVerifyOptions;
								logFailure?: boolean;
							},
						},
						openapi: {
							description: "Verify JWT",
							responses: {
								200: {
									description: "Verified successfully and returned the payload",
									content: {
										"application/json": {
											schema: {
												type: "object",
											},
										},
									},
								},
								400: {
									description: "Failed to verify the JWT",
								},
							},
						},
					},
				},
				async (ctx) => {
					try {
						const { jwk, jwt, options } = ctx.body;
						let payload: JWTPayload | null = null;
						if (jwk) {
							if (typeof jwk === "string")
								payload = await verifyJwtWithKeyInternal(
									ctx,
									pluginOpts,
									jwt,
									jwk,
									options,
								);
							else
								payload = await verifyJwtWithKeyInternal(
									ctx,
									pluginOpts,
									jwt,
									await parseJwk(jwk),
									options,
								);
						} else
							payload = await verifyJwtInternal(ctx, pluginOpts, jwt, options);

						if (payload && !payload.exp)
							throw new APIError("BAD_REQUEST", {
								message:
									'Failed to verify the JWT: Tokens without "Expiration Time" Claim are not allowed, because they are dangerous. If you are sure you want to verify such tokens, create your own endpoint',
							});

						return ctx.json({ payload });
					} catch (error: unknown) {
						// Do not return information about the error to the caller, could be a client who isn't supposed to obtain it
						// Instead log it as an "info" on server inside `verifyJwtInternal`. This is not a system error, verification failure is often nothing unexpected
						if (error instanceof JWTExpired)
							throw new APIError("BAD_REQUEST", {
								message: "Failed to verify the JWT: the token has expired",
							});
						else if (error instanceof APIError) throw error;
						throw new APIError("BAD_REQUEST", {
							message: "Failed to verify the JWT",
						});
					}
				},
			),
			signJwt: createAuthEndpoint(
				"/sign-jwt",
				{
					method: "POST",
					metadata: {
						SERVER_ONLY: true,
						$Infer: {
							body: {} as {
								data: Record<string, any>;
								jwk?: string | JWK;
								claims?: JwtCustomClaims;
							},
						},
						openapi: {
							description: "Sign any data as JWT",
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
					body: z.object({
						data: z.record(z.string(), z.any()),
						jwk: jwkExportedSchema.or(z.string()).optional(),
						claims: jwtCustomClaimsSchema.optional(),
					}),
				},
				async (ctx) => {
					const { data, jwk, claims } = ctx.body;
					if (claims?.exp === null)
						throw new APIError("BAD_REQUEST", {
							message:
								'Failed to sign the JWT: Tokens without "Expiration Time" Claim are not allowed, because they are dangerous. If you are sure you want to create such tokens, create your own endpoint',
						});

					if (jwk === undefined || typeof jwk === "string") {
						const jwt = await signJwtInternal(ctx, pluginOpts, data, {
							jwk: jwk,
							claims: claims,
						});
						return ctx.json({ token: jwt });
					}

					const privateKey = await parseJwk(jwk);

					const jwt = await signJwtInternal(ctx, pluginOpts, data, {
						jwk: privateKey,
						claims: claims,
					});
					return ctx.json({ token: jwt });
				},
			),
			createJwk: createAuthEndpoint(
				"/create-jwk",
				{
					method: "POST",
					metadata: {
						SERVER_ONLY: true,
						$Infer: {
							body: {} as
								| {
										jwkOptions?: JwkOptions;
								  }
								| undefined,
						},
						openapi: {
							description:
								"Create a JSON Web Key pair and save it in the database",
							responses: {
								200: {
									description: "JSON Web Key pair created successfully",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													jwk: {
														description:
															"The public key from newly created JSON Web Key pair",
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
										},
									},
								},
							},
						},
					},
					body: z
						.object({
							jwkOptions: jwkOptionsSchema.optional(),
						})
						.optional(),
				},
				async (ctx) => {
					const key = await createJwkInternal(ctx, {
						...pluginOpts,
						jwks: {
							...pluginOpts?.jwks,
							keyPairConfig:
								ctx.body?.jwkOptions ?? pluginOpts?.jwks?.keyPairConfig,
						},
					});

					return ctx.json({
						jwk: { ...(await JSON.parse(key.publicKey)), kid: key.id },
					});
				},
			),
			importJwk: createAuthEndpoint(
				"/import-jwk",
				{
					method: "POST",
					metadata: {
						SERVER_ONLY: true,
						$Infer: {
							body: {} as {
								jwk: JWK;
							},
						},
						openapi: {
							description: "Import external JWK into the database",
							responses: {
								200: {
									description: "JSON Web Key imported successfully",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													key: {
														description: "The newly created JSON Web Key",
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
										},
									},
								},
								400: {
									description: "A JWK with the same ID exists already",
								},
							},
						},
					},
					body: z.object({
						jwk: jwkExportedSchema,
					}),
				},
				async (ctx) => {
					const exportedPrivateKey = ctx.body.jwk;
					try {
						const key = await importJwkInternal(
							ctx,
							pluginOpts,
							exportedPrivateKey,
						);

						return ctx.json({ key: key });
					} catch (error: unknown) {
						// Custom display of adapter errors to not write "Faile to import the JWK: " twice
						if (error instanceof BetterAuthError) {
							if (
								exportedPrivateKey.kid &&
								error.cause === exportedPrivateKey.kid
							)
								throw new APIError("BAD_REQUEST", {
									message: error.message,
								});
						}
						ctx.context.logger.error(`Failed to import the JWK: ${error}`);
						throw new APIError("BAD_REQUEST", {
							message: `Failed to import the JWK: ${error}`,
						});
					}
				},
			),
			revokeJwk: createAuthEndpoint(
				"/revoke-jwk",
				{
					method: "POST",
					metadata: {
						SERVER_ONLY: true,
						$Infer: {
							body: {} as {
								keyId: string;
							},
						},
						openapi: {
							description:
								"Revokes a JWK pair, but keeps it in the database for transparency",
							responses: {
								200: {
									description: "JSON Web Key revoked successfully",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													key: {
														description: "The newly created JSON Web Key",
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
										},
									},
								},
								400: {
									description: "Could not find the JWK pair to revoke",
								},
							},
						},
					},
					body: z.object({
						keyId: z.string(),
					}),
				},
				async (ctx) => {
					const keyId = ctx.body.keyId;
					try {
						return ctx.json({ key: await revokeJwk(ctx, keyId) });
					} catch (error: unknown) {
						if (error instanceof BetterAuthError) {
							if (error.cause === keyId)
								throw new APIError("BAD_REQUEST", {
									message: "Could not revoke the JWK: the JWK pair not found",
								});
						}
						ctx.context.logger.error(`Could not revoke the JWK: ${error}`);
						throw new APIError("BAD_REQUEST", {
							message: "Could not revoke the JWK",
						});
					}
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
						if (pluginOpts?.disableSettingJwtHeader) {
							return;
						}

						const session = ctx.context.session || ctx.context.newSession;
						if (session && session.session) {
							const jwt = await getSessionJwtInternal(ctx, pluginOpts);
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
		schema: mergeSchema(schema, pluginOpts?.schema),
	} satisfies BetterAuthPlugin;
};
