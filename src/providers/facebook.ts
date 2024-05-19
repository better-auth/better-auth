import type { User } from "../adapters/types";
import type { OAuthProvider, Provider, ProviderOptions } from "./types";

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

export interface FacebookOptions extends ProviderOptions<FacebookProfile> {}

export const facebook = (options: FacebookOptions) => {
	return {
		id: "facebook" as const,
		name: "Facebook",
		type: "oauth",
		scopes: ["email", "public_profile"],
		params: {
			clientId: options.clientId,
			clientSecret: options.clientSecret,
			redirectURL: options.redirectURL,
			authorizationEndpoint: "https://www.facebook.com/v16.0/dialog/oauth",
			tokenEndpoint: "https://graph.facebook.com/v16.0/oauth/access_token",
		},
		async getUserInfo(tokens) {
			const result = await fetch(
				"https://graph.facebook.com/v16.0/me?fields=id,name,email,picture",
				{
					headers: {
						Authorization: `Bearer ${tokens.access_token}`,
					},
				},
			)
				.then((res) => res.json())
				.then((res) => res as FacebookProfile);
			return {
				...result,
				id: result.id,
				name: result.name,
				email: result.email,
				emailVerified: true,
			};
		},
	} satisfies Provider<FacebookProfile>;
};
