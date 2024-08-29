import { Spotify } from "arctic";
import { toBetterAuthProvider } from "./to-provider";
import { betterFetch } from "@better-fetch/fetch";

interface SpotifyProfile {
	id: string;
	display_name: string;
	email: string;
	images: {
		url: string;
	}[];
}

export const spotify = toBetterAuthProvider("spotify", Spotify, {
	async getUserInfo(token) {
		const { data: profile, error } = await betterFetch<SpotifyProfile>(
			"https://api.spotify.com/v1/me",
			{
				method: "GET",
				headers: {
					Authorization: `Bearer ${token.accessToken}`,
				},
			},
		);
		if (error) {
			return null;
		}
		return {
			id: profile.id,
			name: profile.display_name,
			email: profile.email,
			image: profile.images[0]?.url,
			emailVerified: false,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
	},
});
