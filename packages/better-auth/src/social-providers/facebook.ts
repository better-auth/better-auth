import { betterFetch } from "@better-fetch/fetch";
import { Facebook } from "arctic";
import type { OAuthProvider } from ".";
import { getRedirectURI } from "./utils";

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
export interface FacebookOptions {
	clientId: string;
	clientSecret: string;
	redirectURI?: string;
}
export const facebook = ({
	clientId,
	clientSecret,
	redirectURI,
}: FacebookOptions) => {
	const facebookArctic = new Facebook(
		clientId,
		clientSecret,
		getRedirectURI("facebook", redirectURI),
	);
	return {
		id: "facebook",
		name: "Facebook",
		createAuthorizationURL({ state, scopes }) {
			const _scopes = scopes || ["email", "public_profile"];
			return facebookArctic.createAuthorizationURL(state, _scopes);
		},
		validateAuthorizationCode: facebookArctic.validateAuthorizationCode,
		async getUserInfo(token) {
			const { data: profile, error } = await betterFetch<FacebookProfile>(
				"https://graph.facebook.com/me",
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
					name: profile.name,
					email: profile.email,
					emailVerified: profile.email_verified,
				},
				data: profile,
			};
		},
	} satisfies OAuthProvider<FacebookProfile>;
};
