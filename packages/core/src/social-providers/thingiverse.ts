import { betterFetch } from "@better-fetch/fetch";
import { logger } from "../env";
import { BetterAuthError } from "../error";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import { createAuthorizationURL } from "../oauth2";

export interface ThingiverseProfile {
	id: number;
	name: string;
	first_name: string;
	last_name: string;
	full_name: string;
	email: string;
	url: string;
	public_url: string;
	thumbnail: string;
	bio: string;
	level: number;
	bio_html: string;
	location: string;
	country: string;
	registered: string;
	last_active: string;
	cover_image: string;
	things_url: string;
	copies_url: string;
	likes_url: string;
	printers: unknown[];
	programs: unknown[];
	types: unknown[];
	skill_level: string;
	accepts_tips: boolean;
	groups: unknown[];
	website: string;
	twitter: unknown[];
	count_of_followers: number;
	count_of_following: number;
	count_of_designs: number;
	collection_count: number;
	make_count: number;
	like_count: number;
	has_favorite: boolean;
	favorite_count: number;
	is_admin: boolean;
	is_moderator: boolean;
	is_featured: boolean;
	is_verified: boolean;
	default_license: string;
}

export interface ThingiverseToken {
	accessToken: string;
	tokenType?: string | undefined;
}

export interface ThingiverseOptions
	extends ProviderOptions<ThingiverseProfile> {
	clientId: string;
}

export const thingiverse = (options: ThingiverseOptions) => {
	return {
		id: "thingiverse",
		name: "Thingiverse",

		async createAuthorizationURL({ state, redirectURI }) {
			if (!options.clientId || !options.clientSecret) {
				logger.error("Client Id and Secret are required for Thingiverse");
				throw new BetterAuthError("CLIENT_ID_AND_SECRET_REQUIRED");
			}

			return createAuthorizationURL({
				id: "thingiverse",
				options,
				authorizationEndpoint:
					"https://www.thingiverse.com/login/oauth/authorize",
				state,
				redirectURI,
			});
		},

		validateAuthorizationCode: async ({ code, redirectURI }) => {
			const { data: tokenData } = await betterFetch<ThingiverseToken>(
				"https://www.thingiverse.com/login/oauth/access_token",
				{
					method: "POST",
					headers: {
						"Content-Type": "application/x-www-form-urlencoded",
					},
					body: new URLSearchParams({
						client_id: options.clientId,
						client_secret: options.clientSecret || "",
						code,
						redirect_uri: redirectURI,
					}),
					jsonParser: (text) => {
						const params = new URLSearchParams(text);
						return {
							accessToken: params.get("access_token") || "",
							tokenType: params.get("token_type") || undefined,
						};
					},
				},
			);
			if (!tokenData?.accessToken) {
				throw new BetterAuthError("INVALID_AUTHORIZATION_CODE");
			}
			return {
				accessToken: tokenData.accessToken,
				tokenType: tokenData.tokenType,
			};
		},

		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}

			if (!token.accessToken) {
				return null;
			}

			try {
				const { data: profile } = await betterFetch<ThingiverseProfile>(
					"https://api.thingiverse.com/users/me",
					{
						headers: { Authorization: `Bearer ${token.accessToken}` },
					},
				);

				if (!profile) return null;

				const userMap = await options.mapProfileToUser?.(profile);

				return {
					user: {
						id: String(profile.id),
						name: profile.name,
						email: profile.email,
						image: profile.thumbnail,
						emailVerified: profile.is_verified ?? false,
						...userMap,
					},
					data: profile,
				};
			} catch (error) {
				logger.error("Failed to fetch user info from Thingiverse:", error);
				return null;
			}
		},

		options,
	} satisfies OAuthProvider<ThingiverseProfile>;
};
