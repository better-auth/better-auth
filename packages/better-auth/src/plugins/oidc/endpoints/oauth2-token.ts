import type { MakeOIDCPlugin } from "../index";
import type { CodeVerificationValue, OAuthAccessToken } from "../types";
import type { ResolvedOIDCOptions } from "../utils/resolve-oidc-options";

import * as z from "zod/v4";
import { SignJWT } from "jose";
import { getJwtToken } from "../../jwt/sign";
import { getClient } from "../utils/get-client";
import { base64 } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
import { getJwtPlugin } from "../utils/get-jwt-plugin";
import { generateRandomString } from "../../../crypto";
import { setCORSHeaders } from "../utils/set-cors-headers";
import { APIError, createAuthEndpoint } from "../../../api";
import { verifyClientSecret } from "../utils/verify-client-secret";

export const oAuth2Token = (
	options: ResolvedOIDCOptions,
	makePluginOpts: MakeOIDCPlugin,
) =>
	createAuthEndpoint(
		`/${makePluginOpts.pathPrefix}/token`,
		{
			method: "POST",
			body: z.record(z.any(), z.any()),
			metadata: {
				isAction: false,
			},
		},
		async (ctx) => {
			if (makePluginOpts.disableCors) {
				setCORSHeaders(ctx);
			}

			let { body } = ctx;
			if (!body) {
				throw new APIError("BAD_REQUEST", {
					error_description: "request body not found",
					error: "invalid_request",
				});
			}
			if (body instanceof FormData) {
				body = Object.fromEntries(body.entries());
			}
			if (!(body instanceof Object)) {
				throw new APIError("BAD_REQUEST", {
					error_description: "request body is not an object",
					error: "invalid_request",
				});
			}
			let { client_id, client_secret } = body;
			const authorization = ctx.request?.headers.get("authorization") || null;
			if (
				authorization &&
				!client_id &&
				!client_secret &&
				authorization.startsWith("Basic ")
			) {
				try {
					const encoded = authorization.replace("Basic ", "");
					const decoded = new TextDecoder().decode(base64.decode(encoded));
					if (!decoded.includes(":")) {
						throw new APIError("UNAUTHORIZED", {
							error_description: "invalid authorization header format",
							error: "invalid_client",
						});
					}
					const [id, secret] = decoded.split(":");
					if (!id || !secret) {
						throw new APIError("UNAUTHORIZED", {
							error_description: "invalid authorization header format",
							error: "invalid_client",
						});
					}
					client_id = id;
					client_secret = secret;
				} catch (error) {
					throw new APIError("UNAUTHORIZED", {
						error_description: "invalid authorization header format",
						error: "invalid_client",
					});
				}
			}

			const now = Date.now();
			const iat = Math.floor(now / 1000);
			const exp = iat + (options.accessTokenExpiresIn ?? 3600);

			const accessTokenExpiresAt = new Date(
				Date.now() + options.accessTokenExpiresIn * 1000,
			);
			const refreshTokenExpiresAt = new Date(
				Date.now() + options.refreshTokenExpiresIn * 1000,
			);

			const { grant_type, code, redirect_uri, refresh_token, code_verifier } =
				body;
			if (grant_type === "refresh_token") {
				if (!refresh_token) {
					throw new APIError("BAD_REQUEST", {
						error_description: "refresh_token is required",
						error: "invalid_request",
					});
				}
				const token = await ctx.context.adapter.findOne<OAuthAccessToken>({
					model: makePluginOpts.modelNames.oauthAccessToken,
					where: [
						{
							field: "refreshToken",
							value: refresh_token.toString(),
						},
					],
				});
				if (!token) {
					throw new APIError("UNAUTHORIZED", {
						error_description: "invalid refresh token",
						error: "invalid_grant",
					});
				}
				if (token.clientId !== client_id?.toString()) {
					throw new APIError("UNAUTHORIZED", {
						error_description: "invalid client_id",
						error: "invalid_client",
					});
				}
				if (token.refreshTokenExpiresAt < new Date()) {
					throw new APIError("UNAUTHORIZED", {
						error_description: "refresh token expired",
						error: "invalid_grant",
					});
				}
				const accessToken = generateRandomString(32, "a-z", "A-Z");
				const newRefreshToken = generateRandomString(32, "a-z", "A-Z");

				await ctx.context.adapter.create({
					model: makePluginOpts.modelNames.oauthAccessToken,
					data: {
						accessToken,
						refreshToken: newRefreshToken,
						accessTokenExpiresAt,
						refreshTokenExpiresAt,
						clientId: client_id.toString(),
						userId: token.userId,
						scopes: token.scopes,
						createdAt: new Date(),
						updatedAt: new Date(),
					},
				});
				return ctx.json({
					access_token: accessToken,
					token_type: "bearer",
					expires_in: options.accessTokenExpiresIn,
					refresh_token: newRefreshToken,
					scope: token.scopes,
				});
			}

			if (!code) {
				throw new APIError("BAD_REQUEST", {
					error_description: "code is required",
					error: "invalid_request",
				});
			}

			if (options.requirePKCE && !code_verifier) {
				throw new APIError("BAD_REQUEST", {
					error_description: "code verifier is missing",
					error: "invalid_request",
				});
			}

			/**
			 * We need to check if the code is valid before we can proceed
			 * with the rest of the request.
			 */
			const verificationValue =
				await ctx.context.internalAdapter.findVerificationValue(
					code.toString(),
				);
			if (!verificationValue) {
				throw new APIError("UNAUTHORIZED", {
					error_description: "invalid code",
					error: "invalid_grant",
				});
			}
			if (verificationValue.expiresAt < new Date()) {
				throw new APIError("UNAUTHORIZED", {
					error_description: "code expired",
					error: "invalid_grant",
				});
			}

			await ctx.context.internalAdapter.deleteVerificationValue(
				verificationValue.id,
			);
			if (!client_id) {
				throw new APIError("UNAUTHORIZED", {
					error_description: "client_id is required",
					error: "invalid_client",
				});
			}
			if (!grant_type) {
				throw new APIError("BAD_REQUEST", {
					error_description: "grant_type is required",
					error: "invalid_request",
				});
			}
			if (grant_type !== "authorization_code") {
				throw new APIError("BAD_REQUEST", {
					error_description: "grant_type must be 'authorization_code'",
					error: "unsupported_grant_type",
				});
			}

			if (!redirect_uri) {
				throw new APIError("BAD_REQUEST", {
					error_description: "redirect_uri is required",
					error: "invalid_request",
				});
			}

			const client = await getClient(
				ctx,
				options,
				makePluginOpts,
				client_id.toString(),
			);
			if (!client) {
				throw new APIError("UNAUTHORIZED", {
					error_description: "invalid client_id",
					error: "invalid_client",
				});
			}
			if (client.disabled) {
				throw new APIError("UNAUTHORIZED", {
					error_description: "client is disabled",
					error: "invalid_client",
				});
			}

			const value = JSON.parse(
				verificationValue.value,
			) as CodeVerificationValue;
			if (value.clientId !== client_id.toString()) {
				throw new APIError("UNAUTHORIZED", {
					error_description: "invalid client_id",
					error: "invalid_client",
				});
			}
			if (value.redirectURI !== redirect_uri.toString()) {
				throw new APIError("UNAUTHORIZED", {
					error_description: "invalid redirect_uri",
					error: "invalid_client",
				});
			}
			if (value.codeChallenge && !code_verifier) {
				throw new APIError("BAD_REQUEST", {
					error_description: "code verifier is missing",
					error: "invalid_request",
				});
			}
			if (client.type === "public") {
				// For public clients (type: 'public'), validate PKCE instead of client_secret
				if (!code_verifier) {
					throw new APIError("BAD_REQUEST", {
						error_description: "code verifier is required for public clients",
						error: "invalid_request",
					});
				}
				// PKCE validation happens later in the flow, so we skip client_secret validation
			} else {
				if (!client.clientSecret || !client_secret) {
					throw new APIError("UNAUTHORIZED", {
						error_description:
							"client_secret is required for confidential clients",
						error: "invalid_client",
					});
				}
				const isValidSecret = await verifyClientSecret(
					ctx,
					options,
					client.clientSecret,
					client_secret.toString(),
				);
				if (!isValidSecret) {
					throw new APIError("UNAUTHORIZED", {
						error_description: "invalid client_secret",
						error: "invalid_client",
					});
				}
			}
			const challenge =
				value.codeChallengeMethod === "plain"
					? code_verifier
					: await createHash("SHA-256", "base64urlnopad").digest(code_verifier);

			if (challenge !== value.codeChallenge) {
				throw new APIError("UNAUTHORIZED", {
					error_description: "code verification failed",
					error: "invalid_request",
				});
			}

			const requestedScopes = value.scope;
			await ctx.context.internalAdapter.deleteVerificationValue(
				verificationValue.id,
			);
			const accessToken = generateRandomString(32, "a-z", "A-Z");
			const refreshToken = generateRandomString(32, "A-Z", "a-z");
			await ctx.context.adapter.create({
				model: makePluginOpts.modelNames.oauthAccessToken,
				data: {
					accessToken,
					refreshToken,
					accessTokenExpiresAt,
					refreshTokenExpiresAt,
					clientId: client_id.toString(),
					userId: value.userId,
					scopes: requestedScopes.join(" "),
					createdAt: new Date(iat * 1000),
					updatedAt: new Date(iat * 1000),
				},
			});
			const user = await ctx.context.internalAdapter.findUserById(value.userId);
			if (!user) {
				throw new APIError("UNAUTHORIZED", {
					error_description: "user not found",
					error: "invalid_grant",
				});
			}

			const profile = {
				given_name: user.name.split(" ")[0],
				family_name: user.name.split(" ")[1],
				name: user.name,
				profile: user.image,
				updated_at: new Date(user.updatedAt).toISOString(),
			};
			const email = {
				email: user.email,
				email_verified: user.emailVerified,
			};
			const userClaims = {
				...(requestedScopes.includes("profile") ? profile : {}),
				...(requestedScopes.includes("email") ? email : {}),
			};

			const additionalUserClaims = options.getAdditionalUserInfoClaim
				? await options.getAdditionalUserInfoClaim(
						user,
						requestedScopes,
						client,
					)
				: {};

			const payload = {
				sub: user.id,
				aud: client_id.toString(),
				iat: Date.now(),
				auth_time: ctx.context.session
					? new Date(ctx.context.session.session.createdAt).getTime()
					: undefined,
				nonce: value.nonce,
				acr: "urn:mace:incommon:iap:silver", // default to silver - ⚠︎ this should be configurable and should be validated against the client's metadata
				...userClaims,
				...additionalUserClaims,
			};
			const expirationTime =
				Math.floor(Date.now() / 1000) + options.accessTokenExpiresIn;

			let idToken: string;

			// The JWT plugin is enabled, so we use the JWKS keys to sign
			if (options.useJWTPlugin) {
				const jwtPlugin = getJwtPlugin(ctx);
				if (!jwtPlugin) {
					ctx.context.logger.error(
						"OIDC: `useJWTPlugin` is enabled but the JWT plugin is not available. Make sure you have the JWT Plugin in your plugins array or set `useJWTPlugin` to false.",
					);
					throw new APIError("INTERNAL_SERVER_ERROR", {
						error_description: "JWT plugin is not enabled",
						error: "internal_server_error",
					});
				}
				idToken = await getJwtToken(
					{
						...ctx,
						context: {
							...ctx.context,
							session: {
								session: {
									id: generateRandomString(32, "a-z", "A-Z"),
									createdAt: new Date(),
									updatedAt: new Date(),
									userId: user.id,
									expiresAt: new Date(
										Date.now() + options.accessTokenExpiresIn * 1000,
									),
									token: accessToken,
									ipAddress: ctx.request?.headers.get("x-forwarded-for"),
								},
								user,
							},
						},
					},
					{
						...jwtPlugin.options,
						jwt: {
							...jwtPlugin.options?.jwt,
							getSubject: () => user.id,
							audience: client_id.toString(),
							issuer: ctx.context.options.baseURL,
							expirationTime,
							definePayload: () => payload,
						},
					},
				);

				// If the JWT token is not enabled, create a key and use it to sign
			} else {
				idToken = await new SignJWT(payload)
					.setProtectedHeader({ alg: "HS256" })
					.setIssuedAt()
					.setExpirationTime(expirationTime)
					.sign(new TextEncoder().encode(client.clientSecret));
			}

			return ctx.json(
				{
					access_token: accessToken,
					token_type: "Bearer",
					expires_in: options.accessTokenExpiresIn,
					refresh_token: requestedScopes.includes("offline_access")
						? refreshToken
						: undefined,
					scope: requestedScopes.join(" "),
					id_token: requestedScopes.includes("openid") ? idToken : undefined,
				},
				{
					headers: {
						"Cache-Control": "no-store",
						Pragma: "no-cache",
					},
				},
			);
		},
	);
