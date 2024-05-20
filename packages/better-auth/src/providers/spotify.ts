import type { Provider, ProviderOptions } from "./types";

interface SpotifyOptions extends ProviderOptions<SpotifyProfile> {}

interface SpotifyProfile {
	id: string;
	display_name: string;
	email: string;
	images: {
		url: string;
	}[];
}

export const spotify = (options: SpotifyOptions) => {
	return {
		id: "spotify" as const,
		name: "Spotify",
		type: "oauth",
		scopes: ["user-read-email"],
		params: {
			clientId: options.clientId,
			clientSecret: options.clientSecret,
			redirectURL: options.redirectURL,
			authorizationEndpoint: "https://accounts.spotify.com/authorize",
			tokenEndpoint: "https://accounts.spotify.com/api/token",
		},
		async getUserInfo(tokens) {
			const profile = await fetch("https://api.spotify.com/v1/me", {
				headers: {
					Authorization: `Bearer ${tokens.access_token}`,
				},
			})
				.then((res) => res.json())
				.then((res) => res as SpotifyProfile);
			return {
				...profile,
				id: profile.id,
				email: profile.email,
				emailVerified: true,
				name: profile.display_name,
				image: profile.images[0]?.url,
			};
		},
	} satisfies Provider<SpotifyProfile>;
};
