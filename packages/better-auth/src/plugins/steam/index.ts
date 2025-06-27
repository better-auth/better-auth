import { createAuthEndpoint } from "../../api";
import { type BetterAuthPlugin, type User } from "../../types";
import { setSessionCookie } from "../../cookies";
import { z } from "zod";
import { betterFetch } from "@better-fetch/fetch";

const STEAM_BASE_URL = "https://api.steampowered.com/";
const STEAM_PARTNER_URL = `https://partner.steam-api.com`;

export interface SteamAuthPluginOptions {
	steamApiKey: string;
	mapProfileToUser?: (profile: any) => Promise<User>;
}

export const steamAuth = (config: SteamAuthPluginOptions) =>
	({
		id: "steamAuthPlugin",
		endpoints: {
			signInWithSteam: createAuthEndpoint(
				"/sign-in/social/steam",
				{
					method: "POST",
					body: z.object({
						callbackURL: z.string().optional(),
						errorCallbackURL: z.string().optional(),
						newUserCallbackURL: z.string().optional(),
						disableRedirect: z.boolean().optional(),
					}),
				},
				async (ctx) => {
					const encodedCallbackURL = encodeURIComponent(
						ctx.body.callbackURL || "/",
					);
					const returnUrl = `${ctx.context.baseURL}/steam/callback?callbackURL=${encodedCallbackURL}`;
					const openidURL =
						`https://steamcommunity.com/openid/login?` +
						`openid.ns=${encodeURIComponent(
							"http://specs.openid.net/auth/2.0",
						)}&` +
						`openid.mode=checkid_setup&` +
						`openid.return_to=${encodeURIComponent(returnUrl)}&` +
						`openid.realm=${encodeURIComponent(ctx.context.baseURL)}&` +
						`openid.identity=${encodeURIComponent(
							"http://specs.openid.net/auth/2.0/identifier_select",
						)}&` +
						`openid.claimed_id=${encodeURIComponent(
							"http://specs.openid.net/auth/2.0/identifier_select",
						)}&`;

					return ctx.json({
						url: openidURL,
						redirect: !ctx.body.disableRedirect,
					});
				},
			),

			steamCallback: createAuthEndpoint(
				"/steam/callback",
				{ method: "GET" },
				async (ctx) => {
					const errorURL =
						ctx.context.options.onAPIError?.errorURL ||
						`${ctx.context.baseURL}/error`;

					if (!ctx?.request?.url) {
						throw ctx.redirect(`${errorURL}?error=missing_request_url`);
					}

					const searchParams = new URL(ctx.request.url).searchParams.entries();
					const params = Object.fromEntries(searchParams);
					const callbackURL = params.callbackURL || "/";
					// biome-ignore lint/performance/noDelete: Types will complain if I set this to `undefined`.
					delete params.callbackURL;
					console.log(`callbackURL:`, callbackURL);
					console.log(`params:`, params);

					const verifyRes = await betterFetch<string>(
						"https://steamcommunity.com/openid/login",
						{
							method: "POST",
							body: new URLSearchParams({
								...Object.fromEntries(searchParams),
								"openid.mode": "check_authentication",
							}),
							headers: {
								"Content-Type": "application/x-www-form-urlencoded",
							},
						},
					);
					console.log(`verifyRes: `, verifyRes);

					if (verifyRes.error) {
						ctx.context.logger.error(
							`An error occurred while verifying the Steam OpenID:`,
							verifyRes.error,
						);
						throw ctx.redirect(
							`${errorURL}?error=steam_openid_validation_failed`,
						);
					}
					if (!verifyRes.data.includes("is_valid:true")) {
						throw ctx.redirect(
							`${errorURL}?error=steam_openid_validation_failed`,
						);
					}

					const steamid = params["openid.claimed_id"]?.split("/").pop();
					if (!steamid) {
						throw ctx.redirect(`${errorURL}?error=steamid_missing`);
					}

					const profileUrl = new URL(
						`ISteamUser/GetPlayerSummaries/v0002/?key=${config.steamApiKey}&steamids=${steamid}`,
						STEAM_PARTNER_URL,
					);

					type SteamProfile = {
						personaname: string;
						avatarfull: string;
					};

					const profileRes = await betterFetch<SteamProfile>(
						new URL(profileUrl.toString(), STEAM_BASE_URL).toString(),
					);

					if (profileRes.error) {
						ctx.context.logger.error(
							`An error occurred while fetching the Steam profile:`,
							profileRes.error,
						);
						throw ctx.redirect(`${errorURL}?error=steam_profile_fetch_failed`);
					}

					const profile = profileRes.data;
					console.log(profile);

					let account = await ctx.context.internalAdapter.findAccount(steamid);
					let user: User | null = null;
					if (!account) {
						const userDetails =
							(await config.mapProfileToUser?.(profile)) || ({} as User);

						user = await ctx.context.internalAdapter.createUser({
							...userDetails,
							id: userDetails.id || undefined,
							name: userDetails.name || profile.personaname || "Unknown",
							email: userDetails.email || `${steamid}@placeholder.com`,
							emailVerified: userDetails.emailVerified || false,
							image: userDetails.image || profile.avatarfull || "",
						});
						if (!user) {
							ctx.context.logger.error(
								`An error occurred while creating the user during sign in with steam:`,
								userDetails,
							);
							throw ctx.redirect(`${errorURL}?error=user_creation_failed`);
						}
						account = await ctx.context.internalAdapter.createAccount({
							accountId: steamid,
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
					} else {
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
					}

					const session = await ctx.context.internalAdapter.createSession(
						user.id,
						ctx,
					);

					await setSessionCookie(ctx, {
						session,
						user,
					});

					throw ctx.redirect(
						new URL(params.callbackURL || ctx.context.baseURL).toString(),
					);
				},
			),
		},
	}) satisfies BetterAuthPlugin;
