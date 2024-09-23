import { betterFetch } from "@better-fetch/fetch";
import { Discord } from "arctic";
import type { OAuthProvider } from ".";
import { getRedirectURI, validateAuthorizationCode } from "./utils";

export interface DiscordProfile extends Record<string, any> {
	/** the user's id (i.e. the numerical snowflake) */
	id: string;
	/** the user's username, not unique across the platform */
	username: string;
	/** the user's Discord-tag */
	discriminator: string;
	/** the user's display name, if it is set  */
	global_name: string | null;
	/**
	 * the user's avatar hash:
	 * https://discord.com/developers/docs/reference#image-formatting
	 */
	avatar: string | null;
	/** whether the user belongs to an OAuth2 application */
	bot?: boolean;
	/**
	 * whether the user is an Official Discord System user (part of the urgent
	 * message system)
	 */
	system?: boolean;
	/** whether the user has two factor enabled on their account */
	mfa_enabled: boolean;
	/**
	 * the user's banner hash:
	 * https://discord.com/developers/docs/reference#image-formatting
	 */
	banner: string | null;

	/** the user's banner color encoded as an integer representation of hexadecimal color code */
	accent_color: number | null;

	/**
	 * the user's chosen language option:
	 * https://discord.com/developers/docs/reference#locales
	 */
	locale: string;
	/** whether the email on this account has been verified */
	verified: boolean;
	/** the user's email */
	email: string;
	/**
	 * the flags on a user's account:
	 * https://discord.com/developers/docs/resources/user#user-object-user-flags
	 */
	flags: number;
	/**
	 * the type of Nitro subscription on a user's account:
	 * https://discord.com/developers/docs/resources/user#user-object-premium-types
	 */
	premium_type: number;
	/**
	 * the public flags on a user's account:
	 * https://discord.com/developers/docs/resources/user#user-object-user-flags
	 */
	public_flags: number;
	/** undocumented field; corresponds to the user's custom nickname */
	display_name: string | null;
	/**
	 * undocumented field; corresponds to the Discord feature where you can e.g.
	 * put your avatar inside of an ice cube
	 */
	avatar_decoration: string | null;
	/**
	 * undocumented field; corresponds to the premium feature where you can
	 * select a custom banner color
	 */
	banner_color: string | null;
	/** undocumented field; the CDN URL of their profile picture */
	image_url: string;
}

export interface DiscordOptions {
	clientId: string;
	clientSecret: string;
	redirectURI?: string;
}

export const discord = (options: DiscordOptions) => {
	const discordArctic = new Discord(
		options.clientId,
		options.clientSecret,
		getRedirectURI("discord", options.redirectURI),
	);
	return {
		id: "discord",
		name: "Discord",
		createAuthorizationURL({ state, scopes }) {
			const _scope = scopes || ["email"];
			return discordArctic.createAuthorizationURL(state, _scope);
		},
		validateAuthorizationCode: async (code, codeVerifier, redirectURI) => {
			return validateAuthorizationCode({
				code,
				codeVerifier,
				redirectURI:
					redirectURI || getRedirectURI("discord", options.redirectURI),
				options,
				tokenEndpoint: "https://discord.com/api/oauth2/token",
			});
		},
		async getUserInfo(token) {
			const { data: profile, error } = await betterFetch<DiscordProfile>(
				"https://discord.com/api/users/@me",
				{
					auth: {
						type: "Bearer",
						token: token.accessToken(),
					},
				},
			);
			if (error) {
				return null;
			}
			return {
				user: {
					id: profile.id,
					name: profile.display_name || profile.username || "",
					email: profile.email,
					emailVerified: profile.verified,
				},
				data: profile,
			};
		},
	} satisfies OAuthProvider<DiscordProfile>;
};
