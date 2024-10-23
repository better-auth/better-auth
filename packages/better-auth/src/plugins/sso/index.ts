import type { BetterAuthPlugin } from "../../types";
import {
	APIError,
	createAuthEndpoint,
	createEmailVerificationToken,
} from "../../api";
import { getSsoAdapter } from "./adapter";
import { schema } from "./schema";
import { socialProviders } from "../../social-providers";
import { getAccountTokens } from "../../oauth2/get-account";
import { redirectURLMiddleware } from "../../api/middlewares/redirect";
import { z } from "zod";
import { generateState, parseState, type OAuth2Tokens } from "../../oauth2";
import { generateCodeVerifier } from "oslo/oauth2";
import { generateId, HIDE_METADATA, logger } from "../../utils";
import { compareHash } from "../../crypto/hash";
import { userSchema } from "../../db/schema";
import { randomUUID } from "crypto";
import { setSessionCookie } from "../../cookies";

export interface SsoOptions {}

export const sso = (options?: SsoOptions) => {
	return {
		id: "sso",
		endpoints: {
			signIn: createAuthEndpoint(
				"/sso/:id",
				{
					query: z
						.object({
							/**
							 * Redirect to the current URL after the
							 * user has signed in.
							 */
							currentURL: z.string().optional(),
						})
						.optional(),

					body: z.object({
						/**
						 * Callback URL to redirect to after the user has signed in.
						 */
						callbackURL: z.string().optional(),
					}),
					method: "GET",
					use: [redirectURLMiddleware],
				},
				async (ctx) => {
					const adapter = getSsoAdapter(ctx.context.adapter);

					const retrievedSsoConfig = await adapter.getSsoConfig(ctx.params.id);

					console.log(retrievedSsoConfig);

					if (!retrievedSsoConfig) {
						ctx.context.logger.error("SSO Config not found", {
							id: ctx.params.id,
						});
						throw new APIError("NOT_FOUND", {
							message: "SSO config not found",
						});
					}

					const provider =
						retrievedSsoConfig.provider as keyof typeof socialProviders;

					if (provider in socialProviders === false) {
						ctx.context.logger.error("Unknown SSO provider", {
							provider,
						});

						throw new APIError("NOT_FOUND", {
							message: "SSO provider not found",
						});
					}

					let initializedProvider = socialProviders[provider](
						JSON.parse(retrievedSsoConfig.config),
					);

					const cookie = ctx.context.authCookies;
					const currentURL = ctx.query?.currentURL
						? new URL(ctx.query?.currentURL)
						: null;

					const callbackURL = ctx.body.callbackURL?.startsWith("http")
						? ctx.body.callbackURL
						: `${currentURL?.origin}${ctx.body.callbackURL || ""}`;

					const state = await generateState(
						callbackURL || currentURL?.origin || ctx.context.options.baseURL,
					);
					await ctx.setSignedCookie(
						cookie.state.name,
						state.hash,
						ctx.context.secret,
						cookie.state.options,
					);
					const codeVerifier = generateCodeVerifier();
					await ctx.setSignedCookie(
						cookie.pkCodeVerifier.name,
						codeVerifier,
						ctx.context.secret,
						cookie.pkCodeVerifier.options,
					);

					const url = await initializedProvider.createAuthorizationURL({
						state: state.raw,
						codeVerifier,
						redirectURI: `${ctx.context.baseURL}/sso/${ctx.params.id}/callback`,
					});

					return ctx.json({
						url: url.toString(),
						state: state,
						codeVerifier,
						redirect: true,
					});
				},
			),

			callback: createAuthEndpoint(
				"/sso/:id/callback",
				{
					method: "GET",
					query: z.object({
						state: z.string(),
						code: z.string().optional(),
						error: z.string().optional(),
					}),
					metadata: HIDE_METADATA,
				},
				async (ctx) => {
					if (ctx.query.error || !ctx.query.code) {
						const parsedState = parseState(ctx.query.state);
						const callbackURL =
							parsedState.data?.callbackURL || `${ctx.context.baseURL}/error`;
						ctx.context.logger.error(ctx.query.error, ctx.params.id);
						throw ctx.redirect(
							`${callbackURL}?error=${ctx.query.error || "oAuth_code_missing"}`,
						);
					}

					const adapter = getSsoAdapter(ctx.context.adapter);

					const retrievedSsoConfig = await adapter.getSsoConfig(ctx.params.id);

					if (!retrievedSsoConfig) {
						ctx.context.logger.error("SSO Config not found", {
							id: ctx.params.id,
						});
						throw new APIError("NOT_FOUND", {
							message: "SSO config not found",
						});
					}

					const provider =
						retrievedSsoConfig.provider as keyof typeof socialProviders;

					if (provider in socialProviders === false) {
						ctx.context.logger.error("Unknown SSO provider", {
							provider,
						});

						throw new APIError("NOT_FOUND", {
							message: "SSO provider not found",
						});
					}

					let initializedProvider = socialProviders[provider](
						JSON.parse(retrievedSsoConfig.config),
					);

					const parsedState = parseState(ctx.query.state);
					if (!parsedState.success) {
						ctx.context.logger.error("Unable to parse state");
						throw ctx.redirect(
							`${ctx.context.baseURL}/error?error=please_restart_the_process`,
						);
					}

					const {
						data: { callbackURL, currentURL },
					} = parsedState;

					const storedState = await ctx.getSignedCookie(
						ctx.context.authCookies.state.name,
						ctx.context.secret,
					);

					if (!storedState) {
						logger.error("No stored state found");
						throw ctx.redirect(
							`${ctx.context.baseURL}/error?error=please_restart_the_process`,
						);
					}

					const isValidState = await compareHash(ctx.query.state, storedState);
					if (!isValidState) {
						logger.error("OAuth state mismatch");
						throw ctx.redirect(
							`${ctx.context.baseURL}/error?error=please_restart_the_process`,
						);
					}
					const codeVerifier = await ctx.getSignedCookie(
						ctx.context.authCookies.pkCodeVerifier.name,
						ctx.context.secret,
					);

					let tokens: OAuth2Tokens;
					try {
						tokens = await initializedProvider.validateAuthorizationCode({
							code: ctx.query.code,
							codeVerifier,
							redirectURI: `${ctx.context.baseURL}/sso/${initializedProvider.id}/callback`,
						});
					} catch (e) {
						ctx.context.logger.error(e);
						throw ctx.redirect(
							`${ctx.context.baseURL}/error?error=please_restart_the_process`,
						);
					}

					console.log(tokens);

					const user = await initializedProvider
						.getUserInfo(tokens)
						.then((res) => res?.user);
					const id = generateId();
					const data = userSchema.safeParse({
						...user,
						id,
					});

					console.log(data);
					console.log(user);

					if (!user || data.success === false) {
						logger.error("Unable to get user info", data.error);
						throw ctx.redirect(
							`${ctx.context.baseURL}/error?error=please_restart_the_process`,
						);
					}
					if (!callbackURL) {
						throw ctx.redirect(
							`${ctx.context.baseURL}/error?error=please_restart_the_process`,
						);
					}

					//find user in db
					const dbUser = await ctx.context.internalAdapter
						.findUserByEmail(user.email, {
							includeAccounts: true,
						})
						.catch((e) => {
							logger.error(
								"Better auth was unable to query your database.\nError: ",
								e,
							);
							throw ctx.redirect(
								`${ctx.context.baseURL}/error?error=internal_server_error`,
							);
						});

					const userId = dbUser?.user.id;

					if (dbUser) {
						//check if user has already linked this provider
						const hasBeenLinked = dbUser.accounts.find(
							(a) =>
								a.providerId ===
								`${retrievedSsoConfig.provider}:${retrievedSsoConfig.id}`,
						);
						const trustedProviders =
							ctx.context.options.account?.accountLinking?.trustedProviders;
						const isTrustedProvider = trustedProviders
							? trustedProviders.includes(initializedProvider.id as "apple")
							: true;

						if (!hasBeenLinked && (!user.emailVerified || !isTrustedProvider)) {
							let url: URL;
							try {
								url = new URL(currentURL || callbackURL);
								url.searchParams.set("error", "account_not_linked");
							} catch (e) {
								throw ctx.redirect(
									`${ctx.context.baseURL}/error?error=account_not_linked`,
								);
							}
							throw ctx.redirect(url.toString());
						}

						if (!hasBeenLinked) {
							try {
								await ctx.context.internalAdapter.linkAccount({
									providerId: `${retrievedSsoConfig.provider}:${retrievedSsoConfig.id}`,
									accountId: user.id.toString(),
									id: `${initializedProvider.id}:${user.id}`,
									userId: dbUser.user.id,
									...getAccountTokens(tokens),
								});
							} catch (e) {
								console.log(e);
								throw ctx.redirect(
									`${ctx.context.baseURL}/error?error=failed_linking_account`,
								);
							}
						}
					} else {
						try {
							const emailVerified = user.emailVerified;
							const created = await ctx.context.internalAdapter.createOAuthUser(
								{
									...data.data,
									emailVerified,
								},
								{
									...getAccountTokens(tokens),
									id: randomUUID(),
									providerId: initializedProvider.id,
									accountId: user.id.toString(),
								},
							);
							if (
								!emailVerified &&
								created &&
								ctx.context.options.emailVerification?.sendOnSignUp
							) {
								const token = await createEmailVerificationToken(
									ctx.context.secret,
									user.email,
								);
								const url = `${ctx.context.baseURL}/verify-email?token=${token}&callbackURL=${callbackURL}`;
								await ctx.context.options.emailVerification?.sendVerificationEmail?.(
									created.user,
									url,
									token,
								);
							}
						} catch (e) {
							const url = new URL(currentURL || callbackURL);
							url.searchParams.set("error", "unable_to_create_user");
							throw ctx.redirect(url.toString());
						}
					}

					//this should never happen
					if (!userId && !id)
						throw new APIError("INTERNAL_SERVER_ERROR", {
							message: "Unable to create user",
						});
					//create session
					try {
						const session = await ctx.context.internalAdapter.createSession(
							userId || id,
							ctx.request,
						);
						if (!session) {
							const url = new URL(currentURL || callbackURL);
							url.searchParams.set("error", "unable_to_create_session");
							throw ctx.redirect(url.toString());
						}
						try {
							await setSessionCookie(ctx, session.id);
						} catch (e) {
							ctx.context.logger.error("Unable to set session cookie", e);
							const url = new URL(currentURL || callbackURL);
							url.searchParams.set("error", "unable_to_create_session");
							throw ctx.redirect(url.toString());
						}
					} catch {
						const url = new URL(currentURL || callbackURL || "");
						url.searchParams.set("error", "unable_to_create_session");
						throw ctx.redirect(url.toString());
					}
					throw ctx.redirect(callbackURL);
				},
			),
		},
		schema,
	} satisfies BetterAuthPlugin;
};
