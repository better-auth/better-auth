import { createAuthEndpoint } from "../../api";
import type { BetterAuthPlugin, User } from "../../types";
import { setSessionCookie } from "../../cookies";
import { z } from "zod";
import { betterFetch } from "@better-fetch/fetch";

const STEAM_BASE_URL = "https://api.steampowered.com/";

export type SteamProfile = {
	steamid: string;
	communityvisibilitystate: number;
	profilestate: number;
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
	steamApiKey: string;
	mapProfileToUser?: (
		profile: SteamProfile & { email: string },
	) => Promise<User>;
}

export const steam = (config: SteamAuthPluginOptions) =>
	({
		id: "steam",
		endpoints: {
			signInWithSteam: createAuthEndpoint(
				"/sign-in/social/steam",
				{
					method: "POST",
					body: z.object({
						email: z.string(),
						errorCallbackURL: z.string().optional(),
						callbackURL: z.string().optional(),
						newUserCallbackURL: z.string().optional(),
						disableRedirect: z.boolean().optional(),
					}),
				},
				async (ctx) => {
					const callbackURL = ctx.body.callbackURL || "/";
					const email = ctx.body.email;
					const errorCallbackURL = ctx.body.errorCallbackURL || undefined;

					const queryParams = new URLSearchParams({
						callbackURL,
						email,
						...(errorCallbackURL ? { errorCallbackURL } : {}),
					});

					const openidQueryParams = new URLSearchParams({
						"openid.ns": "http://specs.openid.net/auth/2.0",
						"openid.mode": "checkid_setup",
						"openid.realm": new URL(ctx.context.baseURL).origin,
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
				{ method: "GET" },
				async (ctx) => {
					const baseErrorURL =
						ctx.context.options.onAPIError?.errorURL ||
						`${ctx.context.baseURL}/error`;

					// If no request, throw.
					if (!ctx?.request?.url) {
						throw ctx.redirect(`${baseErrorURL}?error=missing_request_url`);
					}

					const searchParamEntries = new URL(
						ctx.request.url,
					).searchParams.entries();

					const { email, callbackURL, errorCallbackURL, ...params } =
						Object.fromEntries(searchParamEntries);

					const errorURL = errorCallbackURL || baseErrorURL;

					const isValidEmail = z
						.string()
						.email()
						.safeParse(email || "");

					// If no email, throw. We need this since Steam OAuth doesn't provide an email.
					if (!isValidEmail.success) {
						ctx.context.logger.error(
							`Invalid email during sign in with steam:`,
							isValidEmail.error,
						);
						throw ctx.redirect(`${errorURL}?error=invalid_email`);
					}

					params["openid.mode"] = "check_authentication";

					const verifyRes = await betterFetch<string>(
						`https://steamcommunity.com/openid/login?${new URLSearchParams(
							params,
						).toString()}`,
						{
							method: "POST",
						},
					);

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

					const profileUrl = `ISteamUser/GetPlayerSummaries/v0002/?key=${config.steamApiKey}&steamids=${steamid}`;

					const profileRes = await betterFetch<{
						response: { players: SteamProfile[] };
					}>(new URL(profileUrl, STEAM_BASE_URL).toString());

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

					let account = await ctx.context.internalAdapter.findAccount(steamid);
					let user: User | null = null;
					if (!account) {
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
