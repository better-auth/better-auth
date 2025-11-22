import { betterFetch } from "@better-fetch/fetch";
import { z } from "zod";
import {
	APIError,
	createAuthEndpoint,
	getSessionFromCtx,
	sessionMiddleware,
} from "../../api";
import { setSessionCookie } from "../../cookies";
import type { BetterAuthPlugin, User } from "../../types";
import { wildcardMatch } from "../../utils/wildcard";

const STEAM_BASE_URL = "https://api.steampowered.com/";

export type SteamProfile = {
	steamid: string;
	communityvisibilitystate: number;
	profilestate: number;
	personaname: string;
	profileurl: string;
	avatar: string;
	avatarmedium: string;
	avatarfull: string;
	avatarhash: string;
	lastlogoff: number;
	personastate: number;
	realname: string;
	primaryclanid: string;
	timecreated: number;
	personastateflags: number;
	loccountrycode: string;
	locstatecode: string;
};

export interface SteamAuthPluginOptions {
	/**
	 * Your Steam API key.
	 *
	 * Register a key here:
	 * https://steamcommunity.com/dev/apikey
	 */
	steamApiKey: string;
	/**
	 * A function to map the Steam profile to a user.
	 *
	 * @param profile The Steam profile.
	 * @returns The Better Auth user.
	 */
	mapProfileToUser?: (
		profile: SteamProfile & { email: string },
	) => Promise<Omit<Partial<User>, "id" | "createdAt" | "updatedAt">>;
	/**
	 * Whether to disable implicit sign up. If true, the user will be redirected to the error callback URL if the user is not found.
	 * Read more here:
	 * https://better-auth.com/docs/concepts/oauth#other-provider-configurations
	 */
	disableImplicitSignUp?: boolean;
	/**
	 * Whether to enable account linking.
	 * @default false
	 */
	accountLinking?: boolean;
}

export const steam = (config: SteamAuthPluginOptions) =>
	({
		id: "steam",
		endpoints: {
			signInWithSteam: createAuthEndpoint(
				"/sign-in/steam",
				{
					method: "POST",
					metadata: {
						openapi: {
							description: "Sign in with Steam using OpenID",
							responses: {
								"200": {
									description: "Success",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													url: { type: "string" },
													redirect: { type: "boolean" },
												},
											},
										},
									},
								},
							},
						},
					},
					body: z.object({
						email: z
							.string()
							.meta({ description: "The email to use for the user" }),
						errorCallbackURL: z
							.string()
							.meta({
								description: "The URL to redirect to if an error occurs",
							})
							.optional(),
						callbackURL: z
							.string()
							.meta({
								description:
									"The URL to redirect to after the user is signed in",
							})
							.optional(),
						newUserCallbackURL: z
							.string()
							.meta({
								description: "The URL to redirect to if the user is new",
							})
							.optional(),
						disableRedirect: z
							.boolean()
							.meta({ description: "Whether to disable redirect" })
							.optional(),
						requestSignUp: z
							.boolean()
							.meta({
								description:
									"Whether to sign up the user if disableImplicitSignUp is enabled",
							})
							.optional(),
					}),
				},
				async (ctx) => {
					const frontendOrigin = new URL(
						ctx.request?.url || ctx.context.baseURL,
					).origin;
					const callbackURL =
						ctx.body.callbackURL || new URL("/", frontendOrigin).toString();
					const email = ctx.body.email;
					const errorCallbackURL = ctx.body.errorCallbackURL
						? new URL(ctx.body.errorCallbackURL, frontendOrigin).toString()
						: undefined;
					const requestSignUp = ctx.body.requestSignUp?.toString() || "false";

					const queryParams = new URLSearchParams({
						callbackURL,
						email,
						...(errorCallbackURL ? { errorCallbackURL } : {}),
						...(requestSignUp ? { requestSignUp } : {}),
					});

					const openidQueryParams = new URLSearchParams({
						"openid.ns": "http://specs.openid.net/auth/2.0",
						"openid.mode": "checkid_setup",
						"openid.realm": frontendOrigin,
						"openid.identity":
							"http://specs.openid.net/auth/2.0/identifier_select",
						"openid.claimed_id":
							"http://specs.openid.net/auth/2.0/identifier_select",
						"openid.return_to": `${
							ctx.context.baseURL
						}/steam/callback?${decodeURIComponent(queryParams.toString())}`,
					});
					const openidURL = new URL(
						`/openid/login?${openidQueryParams.toString()}`,
						`https://steamcommunity.com`,
					);

					return ctx.json({
						url: openidURL.toString(),
						redirect: !ctx.body.disableRedirect,
					});
				},
			),

			steamCallback: createAuthEndpoint(
				"/steam/callback",
				{
					method: "GET",
					query: z.object({
						email: z
							.string()
							.meta({ description: "The email to use for the user" })
							.optional(),
						errorCallbackURL: z
							.string()
							.meta({
								description: "The URL to redirect to if an error occurs",
							})
							.optional(),
						callbackURL: z
							.string()
							.meta({
								description:
									"The URL to redirect to after the user is signed in",
							})
							.optional(),
						newUserCallbackURL: z
							.string()
							.meta({
								description: "The URL to redirect to if the user is new",
							})
							.optional(),
						requestSignUp: z
							.enum(["true", "false"])
							.meta({
								description:
									"Whether to sign up the user if disableImplicitSignUp is enabled",
							})
							.optional()
							.default("false"),
						linkAccount: z
							.string()
							.meta({
								description: "Flag to indicate this is for account linking",
							})
							.optional(),
						"openid.ns": z
							.string()
							.meta({
								description: "The namespace of the OpenID request",
							})
							.optional()
							.default("http://specs.openid.net/auth/2.0"),
						"openid.mode": z
							.string()
							.meta({
								description: "The mode of the OpenID request",
							})
							.optional()
							.default("id_res"),
						"openid.op_endpoint": z
							.string()
							.meta({
								description: "The OP endpoint of the OpenID request",
							})
							.optional()
							.default("https://steamcommunity.com/openid/login"),
						"openid.claimed_id": z
							.string()
							.meta({
								description: "The claimed ID of the OpenID request",
							})
							.optional(),
						"openid.identity": z
							.string()
							.meta({
								description: "The identity of the OpenID request",
							})
							.optional(),
						"openid.return_to": z
							.string()
							.meta({
								description: "The return to of the OpenID request",
							})
							.optional(),
						"openid.response_nonce": z
							.string()
							.meta({
								description: "The response nonce of the OpenID request",
							})
							.optional(),
						"openid.assoc_handle": z
							.string()
							.meta({
								description: "The assoc handle of the OpenID request",
							})
							.optional(),
						"openid.signed": z
							.string()
							.meta({
								description: "The signed of the OpenID request",
							})
							.optional(),
						"openid.sig": z
							.string()
							.meta({
								description: "The sig of the OpenID request",
							})
							.optional(),
					}),
					metadata: {
						client: false,
					},
				},
				async (ctx) => {
					const baseErrorURL =
						ctx.context.options.onAPIError?.errorURL ||
						`${ctx.context.baseURL}/error`;
					const baseOrigin = new URL(ctx.context.baseURL).origin;

					if (!ctx?.request?.url) {
						throw ctx.redirect(`${baseErrorURL}?error=missing_request_url`);
					}

					let {
						email,
						callbackURL = `${ctx.context.baseURL}/`,
						errorCallbackURL = baseErrorURL,
						newUserCallbackURL = callbackURL,
						requestSignUp: requestSignUpString,
						linkAccount,
						...params
					} = ctx.query;

					if (!callbackURL.startsWith("http")) {
						callbackURL = new URL(callbackURL, ctx.context.baseURL).toString();
					}
					if (!errorCallbackURL.startsWith("http")) {
						errorCallbackURL = new URL(
							errorCallbackURL,
							ctx.context.baseURL,
						).toString();
					}
					if (!newUserCallbackURL.startsWith("http")) {
						newUserCallbackURL = new URL(
							newUserCallbackURL,
							ctx.context.baseURL,
						).toString();
					}
					let requestSignUp = requestSignUpString === "true";

					const errorURL = errorCallbackURL || baseErrorURL;

					const trustedOrigins: string[] =
						typeof ctx.context.options.trustedOrigins === "function"
							? await ctx.context.options.trustedOrigins(ctx.request)
							: ctx.context.options.trustedOrigins || [];

					const isMatch = wildcardMatch(trustedOrigins);

					if (!isMatch(new URL(callbackURL).origin)) {
						ctx.context.logger.error(
							`The callback URL provided during sign in with steam is not part of the trusted origins:`,
							callbackURL,
						);
						throw ctx.redirect(`${errorURL}?error=callback_url_not_trusted`);
					}

					if (!isMatch(new URL(newUserCallbackURL).origin)) {
						ctx.context.logger.error(
							`The new user callback URL provided during sign in with steam is not part of the trusted origins:`,
							newUserCallbackURL,
						);
						throw ctx.redirect(
							`${errorURL}?error=new_user_callback_url_not_trusted`,
						);
					}

					if (!isMatch(new URL(errorCallbackURL).origin)) {
						ctx.context.logger.error(
							`The new user callback URL provided during sign in with steam is not part of the trusted origins:`,
							newUserCallbackURL,
						);
						throw ctx.redirect(
							`${errorURL}?error=error_callback_url_not_trusted`,
						);
					}

					params["openid.mode"] = "check_authentication";

					const verifyRes = await betterFetch<string>(
						`https://steamcommunity.com/openid/login?${new URLSearchParams(
							params || {},
						).toString()}`,
						{
							method: "POST",
						},
					);

					if (verifyRes.error) {
						ctx.context.logger.error(
							`Steam OpenID validation failed:`,
							verifyRes.error,
						);
						ctx.context.logger.error(
							`An error occurred while verifying the Steam OpenID:`,
							verifyRes.error,
						);
						throw ctx.redirect(
							`${errorURL}?error=steam_openid_validation_failed`,
						);
					}
					if (!verifyRes.data.includes("is_valid:true")) {
						ctx.context.logger.error(
							`Steam OpenID validation failed:`,
							verifyRes.data,
						);
						throw ctx.redirect(
							`${errorURL}?error=steam_openid_validation_failed`,
						);
					}

					const steamId = params["openid.claimed_id"]?.split("/").pop();
					if (!steamId) {
						throw ctx.redirect(`${errorURL}?error=steamid_missing`);
					}

					const profileRes = await betterFetch<{
						response: { players: SteamProfile[] };
					}>(
						new URL(
							`ISteamUser/GetPlayerSummaries/v0002/?key=${config.steamApiKey}&steamids=${steamId}`,
							STEAM_BASE_URL,
						).toString(),
					);

					if (profileRes.error) {
						ctx.context.logger.error(
							`An error occurred while fetching the Steam profile:`,
							profileRes.error,
						);
						throw ctx.redirect(`${errorURL}?error=steam_profile_fetch_failed`);
					}

					const profile = profileRes.data.response.players[0];

					if (!profile) {
						throw ctx.redirect(`${errorURL}?error=steam_profile_not_found`);
					}

					// Handle account linking flow
					if (linkAccount === "true") {
						const session = await getSessionFromCtx(ctx);
						if (!session) {
							throw ctx.redirect(
								`${errorURL}?error=session_required_for_linking`,
							);
						}
						const user = session.user;

						// Check if account is already linked
						const existingAccount =
							await ctx.context.internalAdapter.findAccount(steamId);
						if (existingAccount) {
							if (existingAccount.userId !== user.id) {
								throw ctx.redirect(
									`${errorURL}?error=account_already_linked_to_different_user`,
								);
							}
							// Account already linked to this user, redirect to success
							throw ctx.redirect(callbackURL);
						}

						// Create the account link
						const newAccount = await ctx.context.internalAdapter.createAccount({
							userId: user.id,
							providerId: "steam",
							accountId: steamId,
						});

						if (!newAccount) {
							throw ctx.redirect(`${errorURL}?error=account_creation_failed`);
						}

						// Update user info if configured
						if (
							ctx.context.options.account?.accountLinking
								?.updateUserInfoOnLink === true
						) {
							await ctx.context.internalAdapter.updateUser(user.id, {
								name: profile.realname || user.name,
								image: profile.avatarfull || user.image,
							});
						}

						throw ctx.redirect(callbackURL || baseOrigin);
					}

					// Regular sign-in flow
					if (!email) {
						ctx.context.logger.error(
							`Email is required for sign in with steam`,
						);
						throw ctx.redirect(`${errorURL}?error=email_required`);
					}

					const isValidEmail = z.string().email().safeParse(email);

					// If no email, throw. We need this since Steam OAuth doesn't provide an email.
					if (!isValidEmail.success) {
						ctx.context.logger.error(
							`Invalid email during sign in with steam:`,
							isValidEmail.error,
						);
						throw ctx.redirect(`${errorURL}?error=invalid_email`);
					}

					let account = await ctx.context.internalAdapter.findAccount(steamId);
					let user: User | null = null;
					let isNewUser = false;

					if (
						!account &&
						(typeof config.disableImplicitSignUp === "boolean"
							? config.disableImplicitSignUp && requestSignUp
							: true)
					) {
						isNewUser = true;
						const userDetails = await config.mapProfileToUser?.({
							...profile,
							email,
						});

						user = await ctx.context.internalAdapter.createUser({
							...(userDetails || {}),
							name: userDetails?.name || profile.realname || "Unknown",
							email: userDetails?.email || email,
							emailVerified: userDetails?.emailVerified || false,
							image: userDetails?.image || profile.avatarfull || "",
						});
						if (!user) {
							ctx.context.logger.error(
								`An error occurred while creating the user during sign in with steam:`,
								userDetails,
							);
							throw ctx.redirect(`${errorURL}?error=user_creation_failed`);
						}
						account = await ctx.context.internalAdapter.createAccount({
							accountId: steamId,
							providerId: "steam",
							userId: user.id,
						});
						if (!account) {
							ctx.context.logger.error(
								`An error occurred while creating the account during sign in with steam:`,
								userDetails,
							);
							throw ctx.redirect(`${errorURL}?error=account_creation_failed`);
						}
					} else if (account) {
						user = await ctx.context.internalAdapter.findUserById(
							account.userId,
						);
						if (!user) {
							ctx.context.logger.error(
								`An error occurred while finding the user during sign in with steam:`,
								account,
							);
							throw ctx.redirect(`${errorURL}?error=user_not_found`);
						}
					} else {
						throw ctx.redirect(`${errorURL}?error=account_not_found`);
					}

					const session = await ctx.context.internalAdapter.createSession(
						user.id,
					);

					await setSessionCookie(ctx, { session, user });

					throw ctx.redirect(
						isNewUser
							? newUserCallbackURL || callbackURL || baseOrigin
							: callbackURL || baseOrigin,
					);
				},
			),
			linkAccountWithSteam: createAuthEndpoint(
				"/link-social/steam",
				{
					method: "POST",
					use: [sessionMiddleware],
					metadata: {
						openapi: {
							description: "Link a Steam account to the current user",
							responses: {
								"200": {
									description: "Success",
									content: {
										"application/json": {
											schema: {
												type: "object",
												properties: {
													url: { type: "string" },
													redirect: { type: "boolean" },
												},
											},
										},
									},
								},
							},
						},
					},
					body: z.object({
						callbackURL: z
							.string()
							.meta({
								description:
									"The URL to redirect to after the user has linked their account.",
							})
							.optional(),
						errorCallbackURL: z
							.string()
							.meta({
								description: "The URL to redirect to if an error occurs.",
							})
							.optional(),
						disableRedirect: z
							.boolean()
							.meta({ description: "Whether to disable redirect." })
							.optional(),
					}),
				},
				async (ctx) => {
					if (config.accountLinking !== true) {
						throw new APIError("BAD_REQUEST", {
							message: "Account linking is disabled",
						});
					}

					const frontendOrigin = new URL(
						ctx.request?.url || ctx.context.baseURL,
					).origin;
					const callbackURL = ctx.body.callbackURL || `${ctx.context.baseURL}/`;
					const errorCallbackURL =
						ctx.body.errorCallbackURL || `${ctx.context.baseURL}/error`;

					const queryParams = new URLSearchParams({
						callbackURL,
						errorCallbackURL,
						linkAccount: "true", // Flag to indicate this is for account linking
					});

					const openidQueryParams = new URLSearchParams({
						"openid.ns": "http://specs.openid.net/auth/2.0",
						"openid.mode": "checkid_setup",
						"openid.realm": frontendOrigin,
						"openid.identity":
							"http://specs.openid.net/auth/2.0/identifier_select",
						"openid.claimed_id":
							"http://specs.openid.net/auth/2.0/identifier_select",
						"openid.return_to": `${
							ctx.context.baseURL
						}/steam/callback?${decodeURIComponent(queryParams.toString())}`,
					});
					const openidURL = new URL(
						`/openid/login?${openidQueryParams.toString()}`,
						`https://steamcommunity.com`,
					);

					return ctx.json({
						url: openidURL.toString(),
						redirect: !ctx.body.disableRedirect,
					});
				},
			),
		},
	}) satisfies BetterAuthPlugin;
