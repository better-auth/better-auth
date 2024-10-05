import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from ".";
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

export interface DiscordOptions extends ProviderOptions {}

export const discord = (options: DiscordOptions) => {
	return {
		id: "discord",
		name: "Discord",
		createAuthorizationURL({ state, scopes }) {
			const _scopes = options.scope || scopes || ["identify", "email"];
			return new URL(
				`https://discord.com/api/oauth2/authorize?scope=${_scopes.join(
					"+",
				)}&response_type=code&client_id=${
					options.clientId
				}&redirect_uri=${encodeURIComponent(
					getRedirectURI("discord", options.redirectURI),
				)}&state=${state}`,
			);
		},
		validateAuthorizationCode: async (code, codeVerifier, redirectURI) => {
			return validateAuthorizationCode({
				code,
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
					headers: {
						authorization: `Bearer ${token.accessToken()}`,
					},
				},
			);

			if (error) {
				return null;
			}
			if (profile.avatar === null) {
				const defaultAvatarNumber =
					profile.discriminator === "0"
						? Number(BigInt(profile.id) >> BigInt(22)) % 6
						: parseInt(profile.discriminator) % 5;
				profile.image_url = `https://cdn.discordapp.com/embed/avatars/${defaultAvatarNumber}.png`;
			} else {
				const format = profile.avatar.startsWith("a_") ? "gif" : "png";
				profile.image_url = `https://cdn.discordapp.com/avatars/${profile.id}/${profile.avatar}.${format}`;
			}
			return {
				user: {
					id: profile.id,
					name: profile.display_name || profile.username || "",
					email: profile.email,
					emailVerified: profile.verified,
					image: profile.image_url,
				},
				data: profile,
			};
		},
	} satisfies OAuthProvider<DiscordProfile>;
};
