import type { BetterAuthPlugin } from "@better-auth/core";
import {
	createAuthEndpoint,
	createAuthMiddleware,
} from "@better-auth/core/api";
import { BetterAuthError } from "@better-auth/core/error";
import type { JSONWebKeySet, JWTPayload } from "jose";
import * as z from "zod";
import { APIError, sessionMiddleware } from "../../api";
import { mergeSchema } from "../../db/schema";
import { getJwksAdapter } from "./adapter";
import { schema } from "./schema";
import { getJwtToken, signJWT } from "./sign";
import type { JwtOptions } from "./types";
import { createJwk } from "./utils";
import { verifyJWT as verifyJWTHelper } from "./verify";

export type * from "./types";
export { createJwk, generateExportedKeyPair } from "./utils";
export { verifyJWT } from "./verify";

const signJWTBodySchema = z.object({
	payload: z.record(z.string(), z.any()),
	overrideOptions: z.record(z.string(), z.any()).optional(),
});

const verifyJWTBodySchema = z.object({
	token: z.string(),
	issuer: z.string().optional(),
});

export const jwt = (options?: JwtOptions | undefined) => {
	// Remote url must be set when using signing function
	if (options?.jwt?.sign && !options.jwks?.remoteUrl) {
		throw new BetterAuthError(
			"jwks_config",
			"jwks.remoteUrl must be set when using jwt.sign",
		);
	}

	// Alg is required to be specified when using remote url (needed in openid metadata)
	if (options?.jwks?.remoteUrl && !options.jwks?.keyPairConfig?.alg) {
		throw new BetterAuthError(
			"jwks_config",
			"must specify alg when using the oidc plugin and jwks.remoteUrl",
		);
	}

	const jwksPath = options?.jwks?.jwksPath ?? "/jwks";
	if (
		typeof jwksPath !== "string" ||
		jwksPath.length === 0 ||
		!jwksPath.startsWith("/") ||
		jwksPath.includes("..")
	) {
		throw new BetterAuthError(
			"jwks_config",
			"jwksPath must be a non-empty string starting with '/' and not contain '..'",
		);
	}

	return {
		id: "jwt",
		options,
		endpoints: {
			getJwks: createAuthEndpoint(
				jwksPath,
				{
					method: "GET",
					metadata: {
						openapi: {
							operationId: "getJSONWebKeySet",
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

					const adapter = getJwksAdapter(ctx.context.adapter, options);

					let keySets = await adapter.getAllKeys(ctx);

					if (!keySets || keySets?.length === 0) {
						await createJwk(ctx, options);
						keySets = await adapter.getAllKeys(ctx);
					}

					if (!keySets?.length) {
						throw new BetterAuthError(
							"No key sets found. Make sure you have a key in your database.",
						);
					}

					const now = Date.now();
					const DEFAULT_GRACE_PERIOD = 60 * 60 * 24 * 30;
					const gracePeriod =
						(options?.jwks?.gracePeriod ?? DEFAULT_GRACE_PERIOD) * 1000;

					const keys = keySets.filter((key) => {
						if (!key.expiresAt) {
							return true;
						}
						return key.expiresAt.getTime() + gracePeriod > now;
					});

					const keyPairConfig = options?.jwks?.keyPairConfig;
					const defaultCrv = keyPairConfig
						? "crv" in keyPairConfig
							? (keyPairConfig as { crv: string }).crv
							: undefined
						: undefined;
					return ctx.json({
						keys: keys.map((keySet) => {
							return {
								alg: keySet.alg ?? options?.jwks?.keyPairConfig?.alg ?? "EdDSA",
								crv: keySet.crv ?? defaultCrv,
								...JSON.parse(keySet.publicKey),
								kid: keySet.id,
							};
						}),
					} satisfies JSONWebKeySet as JSONWebKeySet);
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
							operationId: "getJSONWebToken",
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
								overrideOptions?: JwtOptions | undefined;
							},
						},
					},
					body: signJWTBodySchema,
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
			verifyJWT: createAuthEndpoint(
				"/verify-jwt",
				{
					method: "POST",
					metadata: {
						SERVER_ONLY: true,
						$Infer: {
							body: {} as {
								token: string;
								issuer?: string;
							},
							response: {} as {
								payload: {
									sub: string;
									aud: string;
									[key: string]: any;
								} | null;
							},
						},
					},
					body: verifyJWTBodySchema,
				},
				async (ctx) => {
					const overrideOptions = ctx.body.issuer
						? {
								...options,
								jwt: {
									...options?.jwt,
									issuer: ctx.body.issuer,
								},
							}
						: options;

					const payload = await verifyJWTHelper(
						ctx.body.token,
						overrideOptions,
					);

					return ctx.json({ payload });
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
