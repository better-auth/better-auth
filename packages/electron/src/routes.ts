import { Buffer } from "node:buffer";
import { timingSafeEqual } from "node:crypto";
import type { GenericEndpointContext } from "@better-auth/core";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import { SocialProviderListEnum } from "@better-auth/core/social-providers";
import { safeJSONParse } from "@better-auth/core/utils/json";
import { base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
import { betterFetch } from "@better-fetch/fetch";
import { createAuthEndpoint, sessionMiddleware } from "better-auth/api";
import {
	parseSetCookieHeader,
	setSessionCookie,
	toCookieOptions,
} from "better-auth/cookies";
import type { User } from "better-auth/db";
import { parseUserOutput } from "better-auth/db";
import * as z from "zod";
import { ELECTRON_ERROR_CODES } from "./error-codes";
import type { ElectronOptions } from "./types";

const electronTokenBodySchema = z.object({
	token: z.string().nonempty(),
	state: z.string().nonempty(),
	code_verifier: z.string().nonempty(),
});

export const electronToken = (_opts: ElectronOptions) =>
	createAuthEndpoint(
		"/electron/token",
		{
			method: "POST",
			body: electronTokenBodySchema,
			metadata: {
				scope: "http",
				openapi: {
					description: "Exchange the electron token for a session",
					operationId: "electronToken",
					responses: {
						200: {
							description: "Returns the session token and user",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											token: {
												type: "string",
											},
											user: {
												type: "object",
												$ref: "#/components/schemas/User",
											},
										},
										required: ["token", "user"],
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			// Consume the single-use authorization code up front so concurrent
			// exchanges of the same code cannot both mint a session: the first
			// caller receives the row, every racer gets null. consume also gates
			// expiry, so no separate expiresAt check is needed.
			const token = await ctx.context.internalAdapter.consumeVerificationValue(
				`electron:${ctx.body.token}`,
			);
			if (!token) {
				throw APIError.from("NOT_FOUND", ELECTRON_ERROR_CODES.INVALID_TOKEN);
			}

			const tokenRecord = safeJSONParse<Record<string, any>>(token.value);
			if (!tokenRecord) {
				throw APIError.from(
					"INTERNAL_SERVER_ERROR",
					ELECTRON_ERROR_CODES.INVALID_TOKEN,
				);
			}

			if (tokenRecord.state !== ctx.body.state) {
				throw APIError.from("BAD_REQUEST", ELECTRON_ERROR_CODES.STATE_MISMATCH);
			}

			if (!tokenRecord.codeChallenge) {
				throw APIError.from(
					"BAD_REQUEST",
					ELECTRON_ERROR_CODES.MISSING_CODE_CHALLENGE,
				);
			}
			// Only S256 is accepted. The legacy `plain` comparison is rejected:
			// in plain mode the verifier equals the challenge, which travels in
			// the sign-in URL, so the comparison adds nothing for this flow.
			if (tokenRecord.codeChallengeMethod !== "s256") {
				throw APIError.from(
					"BAD_REQUEST",
					ELECTRON_ERROR_CODES.INVALID_PKCE_METHOD,
				);
			}
			const codeChallenge = Buffer.from(
				base64Url.decode(tokenRecord.codeChallenge),
			);
			const codeVerifier = Buffer.from(
				await createHash("SHA-256").digest(ctx.body.code_verifier),
			);

			if (
				codeChallenge.length !== codeVerifier.length ||
				!timingSafeEqual(codeChallenge, codeVerifier)
			) {
				throw APIError.from(
					"BAD_REQUEST",
					ELECTRON_ERROR_CODES.INVALID_CODE_VERIFIER,
				);
			}
			const user = await ctx.context.internalAdapter.findUserById(
				tokenRecord.userId,
			);
			if (!user) {
				throw APIError.from(
					"INTERNAL_SERVER_ERROR",
					BASE_ERROR_CODES.USER_NOT_FOUND,
				);
			}

			const session = await ctx.context.internalAdapter.createSession(user.id);
			if (!session) {
				throw APIError.from(
					"INTERNAL_SERVER_ERROR",
					BASE_ERROR_CODES.FAILED_TO_CREATE_SESSION,
				);
			}

			await setSessionCookie(ctx, {
				session,
				user,
			});

			return ctx.json({
				token: session.token,
				user: parseUserOutput(ctx.context.options, user) as User &
					Record<string, any>,
			});
		},
	);

const electronInitOAuthProxyQuerySchema = z.object({
	provider: z.string().nonempty(),
	state: z.string(),
	code_challenge: z.string(),
	code_challenge_method: z.string().optional(),
});

export const electronInitOAuthProxy = (opts: ElectronOptions) =>
	createAuthEndpoint(
		"/electron/init-oauth-proxy",
		{
			method: "GET",
			query: electronInitOAuthProxyQuerySchema,
			metadata: {
				scope: "http",
				openapi: {
					description: "Initialize the OAuth proxy for the electron app",
					operationId: "electronInitOAuthProxy",
					responses: {
						200: {
							description:
								"Returns the URL to redirect to and if the redirect should be performed",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											url: {
												type: "string",
												nullable: true,
											},
											redirect: {
												type: "boolean",
											},
											user: {
												type: "object",
												$ref: "#/components/schemas/User",
											},
											token: {
												type: "string",
											},
										},
										required: ["url", "redirect"],
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const isSocialProvider = SocialProviderListEnum.safeParse(
				ctx.query.provider,
			);
			if (!isSocialProvider && !ctx.context.getPlugin("generic-oauth")) {
				throw APIError.from("BAD_REQUEST", BASE_ERROR_CODES.PROVIDER_NOT_FOUND);
			}

			// Electron transfers require S256 PKCE; reject any other method
			// rather than forwarding a downgraded `plain` challenge.
			if (
				ctx.query.code_challenge_method &&
				ctx.query.code_challenge_method.toLowerCase() !== "s256"
			) {
				throw APIError.from(
					"BAD_REQUEST",
					ELECTRON_ERROR_CODES.INVALID_PKCE_METHOD,
				);
			}

			const headers = new Headers(ctx.request?.headers);
			headers.set("origin", new URL(ctx.context.baseURL).origin);
			let setCookies: string[] = [];
			const searchParams = new URLSearchParams();
			searchParams.set("client_id", opts.clientID || "electron");
			searchParams.set("code_challenge", ctx.query.code_challenge);
			searchParams.set("code_challenge_method", "S256");
			searchParams.set("state", ctx.query.state);
			const res = await betterFetch<{
				url: string | undefined;
				redirect: boolean;
				user?: User & Record<string, any>;
				token?: string;
			}>(
				`${isSocialProvider ? "/sign-in/social" : "/sign-in/oauth2"}?${searchParams.toString()}`,
				{
					baseURL: ctx.context.baseURL,
					method: "POST",
					body: {
						provider: ctx.query.provider,
					},
					onResponse: (innerCtx) => {
						setCookies = innerCtx.response.headers.getSetCookie();
					},
					headers,
				},
			);

			if (res.error) {
				throw new APIError("INTERNAL_SERVER_ERROR", {
					message: res.error.message || "An unknown error occurred.",
				});
			}

			for (const cookieStr of setCookies) {
				const parsed = parseSetCookieHeader(cookieStr);
				parsed.forEach((attrs, name) => {
					ctx.setCookie(name, attrs.value, toCookieOptions(attrs));
				});
			}

			if (res.data.url && res.data.redirect) {
				ctx.setHeader("Location", res.data.url);
				ctx.setStatus(302);
				return;
			}
			return ctx.json(res.data);
		},
	);

const electronTransferUserQuerySchema = z.object({
	client_id: z.string(),
	state: z.string(),
	code_challenge: z.string(),
	code_challenge_method: z.string().optional(),
});
const electronTransferUserBodySchema = z.object({
	callbackURL: z.string().optional(),
});

export const electronTransferUser = (
	_opts: ElectronOptions,
	{
		handleTransfer,
	}: {
		handleTransfer: (
			ctx: GenericEndpointContext,
			payload: {
				client_id: string;
				state: string;
				code_challenge: string;
				code_challenge_method?: string | undefined;
			},
		) => Promise<string | null>;
	},
) =>
	createAuthEndpoint(
		"/electron/transfer-user",
		{
			method: "POST",
			query: electronTransferUserQuerySchema,
			body: electronTransferUserBodySchema,
			use: [sessionMiddleware],
			requireHeaders: true,
			metadata: {
				openapi: {
					description: "Transfer the user to the electron app",
					operationId: "electronTransferUser",
					responses: {
						200: {
							description:
								"Returns the URL to redirect to and if the redirect should be performed",
							content: {
								"application/json": {
									schema: {
										type: "object",
										properties: {
											url: {
												type: "string",
												nullable: true,
											},
											redirect: {
												type: "boolean",
											},
											electron_authorization_code: {
												type: "string",
											},
										},
										required: [
											"url",
											"redirect",
											"electron_authorization_code",
										],
									},
								},
							},
						},
					},
				},
			},
		},
		async (ctx) => {
			const identifier = await handleTransfer(ctx, ctx.query);
			if (identifier === null) {
				throw APIError.from(
					"BAD_REQUEST",
					ELECTRON_ERROR_CODES.INVALID_CLIENT_ID,
				);
			}

			return ctx.json({
				url: ctx.body.callbackURL ? ctx.body.callbackURL : null,
				redirect: ctx.body.callbackURL ? true : false,
				electron_authorization_code: identifier,
			});
		},
	);
