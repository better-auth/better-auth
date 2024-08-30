import { betterFetch } from "@better-fetch/fetch";
import { Facebook } from "arctic";
import { toBetterAuthProvider } from "./to-provider";

export interface FacebookProfile {
	id: string;
	name: string;
	email: string;
	email_verified: boolean;
	picture: {
		data: {
			height: number;
			is_silhouette: boolean;
			url: string;
			width: number;
		};
	};
}

export const facebook = toBetterAuthProvider("facebook", Facebook, {
	async getUserInfo(token) {
		const { data: profile, error } = await betterFetch<FacebookProfile>(
			"https://graph.facebook.com/v16.0/me?fields=id,name,email,picture",
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
			name: profile.name,
			email: profile.email,
			image: profile.picture.data.url,
			emailVerified: profile.email_verified,
			createdAt: new Date(),
			updatedAt: new Date(),
		};
	},
});
