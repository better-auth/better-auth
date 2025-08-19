import type { MakeOIDCPlugin } from "../index";
import type { CodeVerificationValue } from "../types";
import type { ResolvedOIDCOptions } from "../utils/resolve-oidc-options";

import * as z from "zod/v4";
import { generateRandomString } from "../../../crypto";
import { APIError, createAuthEndpoint, sessionMiddleware } from "../../../api";

export const oAuth2Consent = (
	options: ResolvedOIDCOptions,
	makePluginOpts: MakeOIDCPlugin,
) =>
	createAuthEndpoint(
		`/${makePluginOpts.pathPrefix}/consent`,
		{
			method: "POST",
			body: z.object({
				accept: z.boolean(),
				consent_code: z.string().optional(),
			}),
			use: [sessionMiddleware],
			metadata: {
				openapi: {
					description:
						"Handle OAuth2 consent. Supports both URL parameter-based flows (consent_code in body) and cookie-based flows (signed cookie).",
					requestBody: {
						required: true,
						content: {
							"application/json": {
								schema: {
									type: "object",
									properties: {
										accept: {
											type: "boolean",
											description:
												"Whether the user accepts or denies the consent request",
										},
										consent_code: {
											type: "string",
											description:
												"The consent code from the authorization request. Optional if using cookie-based flow.",
										},
									},
									required: ["accept"],
								},
							},
						},
					},
					responses: {
						"200": {
							description: "Consent processed successfully",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											redirectURI: {
												type: "string",
												format: "uri",
												description:
													"The URI to redirect to, either with an authorization code or an error",
											},
										},
										required: ["redirectURI"],
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			// Support both consent flow methods:
			// 1. URL parameter-based: consent_code in request body (standard OAuth2 pattern)
			// 2. Cookie-based: using signed cookie for stateful consent flows
			let consentCode: string | null = ctx.body.consent_code || null;

			if (!consentCode) {
				// Check for cookie-based consent flow
				consentCode = await ctx.getSignedCookie(
					"oidc_consent_prompt",
					ctx.context.secret,
				);
			}

			if (!consentCode) {
				throw new APIError("UNAUTHORIZED", {
					error_description:
						"consent_code is required (either in body or cookie)",
					error: "invalid_request",
				});
			}

			const verification =
				await ctx.context.internalAdapter.findVerificationValue(consentCode);
			if (!verification) {
				throw new APIError("UNAUTHORIZED", {
					error_description: "Invalid code",
					error: "invalid_request",
				});
			}
			if (verification.expiresAt < new Date()) {
				throw new APIError("UNAUTHORIZED", {
					error_description: "Code expired",
					error: "invalid_request",
				});
			}

			// Clear the cookie
			ctx.setCookie("oidc_consent_prompt", "", {
				maxAge: 0,
			});

			const value = JSON.parse(verification.value) as CodeVerificationValue;
			if (!value.requireConsent) {
				throw new APIError("UNAUTHORIZED", {
					error_description: "Consent not required",
					error: "invalid_request",
				});
			}

			if (!ctx.body.accept) {
				await ctx.context.internalAdapter.deleteVerificationValue(
					verification.id,
				);
				return ctx.json({
					redirectURI: `${value.redirectURI}?error=access_denied&error_description=User denied access`,
				});
			}
			const code = generateRandomString(32, "a-z", "A-Z", "0-9");
			const codeExpiresInMs = options.codeExpiresIn * 1000;
			const expiresAt = new Date(Date.now() + codeExpiresInMs);
			await ctx.context.internalAdapter.updateVerificationValue(
				verification.id,
				{
					value: JSON.stringify({
						...value,
						requireConsent: false,
					}),
					identifier: code,
					expiresAt,
				},
			);
			await ctx.context.adapter.create({
				model: makePluginOpts.modelNames.oauthConsent,
				data: {
					clientId: value.clientId,
					userId: value.userId,
					scopes: value.scope.join(" "),
					consentGiven: true,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});
			const redirectURI = new URL(value.redirectURI);
			redirectURI.searchParams.set("code", code);
			if (value.state) redirectURI.searchParams.set("state", value.state);
			return ctx.json({
				redirectURI: redirectURI.toString(),
			});
		},
	);
