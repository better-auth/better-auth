import type { Provider, ProviderOptions } from "./types";

export interface TwitchProfile {
	/**
	 * The sub of the user
	 */
	sub: string;
	/**
	 * The preferred username of the user
	 */
	preferred_username: string;
	/**
	 * The email of the user
	 */
	email: string;
	/**
	 * The picture of the user
	 */
	picture: string;
}

export interface TwitchOptions extends ProviderOptions<TwitchProfile> {}

export const Twitch = (options: TwitchOptions) => {
	const authorizeEndpoint = "https://id.twitch.tv/oauth2/authorize";
	const tokenEndpoint = "https://id.twitch.tv/oauth2/token";
	return {
		id: "twitch" as const,
		name: "Twitch",
		type: "oauth",
		scopes: options.scopes ?? ["openid user:read:email"],
		params: {
			clientId: options.clientId,
			linkAccounts: options.linkAccounts,
			clientSecret: options.clientSecret,
			redirectURL: options.redirectURL,
			authorizationEndpoint: authorizeEndpoint,
			tokenEndpoint: tokenEndpoint,
		},
		async getUserInfo(tokens) {
			const headers = {
				Authorization: `Bearer ${tokens.access_token}`,
			};
			const result = await fetch("https://api.twitch.tv/helix/users", {
				headers,
			})
				.then((res) => res.json())
				.then((res) => res.data[0] as TwitchProfile);
			return {
				...result,
				id: result.sub,
				email: result.email,
				emailVerified: true,
				name: result.preferred_username,
				image: result.picture,
			};
		},
	} satisfies Provider<TwitchProfile>;
};
