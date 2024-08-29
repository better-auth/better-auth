import { Twitch } from "arctic";
import { toBetterAuthProvider } from "./to-provider";
import { betterFetch } from "@better-fetch/fetch";

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

export const twitch = toBetterAuthProvider("twitch", Twitch, {
	async getUserInfo(token) {
		const { data: profile, error } = await betterFetch<TwitchProfile>(
			"https://api.twitch.tv/helix/users",
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
			id: profile.sub,
			name: profile.preferred_username,
			email: profile.email,
			image: profile.picture,
			emailVerified: false,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
	},
});
