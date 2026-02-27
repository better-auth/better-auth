import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import { createAuthorizationURL, validateAuthorizationCode } from "../oauth2";
import { decodeJwt } from "jose";

export interface MezonProfile extends Record<string, any> {
  user_id: string;
  email: string;
  sub: string;
  username: string;
  mezon_id: string;
  display_name?: string;
  avatar?: string;
}

export interface MezonOptions extends ProviderOptions<MezonProfile> {
	clientId: string;
  clientSecret: string;
}

export const mezon = (options: MezonOptions) => {
	return {
		id: "mezon",
		name: "Mezon",
		async createAuthorizationURL({
			state,
			scopes,
			redirectURI,
		}) {
			const _scopes = options.disableDefaultScope
				? []
				: ["offline", "openid"];
			if (options.scope) _scopes.push(...options.scope);
			if (scopes) _scopes.push(...scopes);
			return createAuthorizationURL({
				id: "mezon",
				options,
				authorizationEndpoint: "https://oauth2.mezon.ai/oauth2/auth",
				scopes: _scopes,
				state,
				redirectURI,
			});
		},

		validateAuthorizationCode: async ({ code, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				redirectURI,
				options,
				tokenEndpoint: "https://oauth2.mezon.ai/oauth2/token",
        authentication: "post",
			});
		},

		async getUserInfo(token) {
      if (token.idToken) {
        const profile = decodeJwt<MezonProfile>(token.idToken);

        if (!profile) {
          return null;
        }

        return {
          user: {
            id: profile.user_id,
            name: profile?.display_name ?? profile.username,
            email: profile.email,
            image: profile?.avatar,
            emailVerified: true,
          },
          data: profile,
        };
      }

			const { data: profile, error } = await betterFetch<MezonProfile>(
				"https://oauth2.mezon.ai/userinfo",
        {
					auth: {
						type: "Bearer",
						token: token.accessToken,
					},
				},
			);

			if (error) {
				return null;
			}

			return {
				user: {
					id: profile.user_id,
					name: profile?.display_name ?? profile.username,
					email: profile.email,
					image: profile?.avatar,
					emailVerified: true,
				},
				data: profile,
			};
		},
	} satisfies OAuthProvider<MezonProfile>;
};