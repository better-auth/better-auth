import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import { createAuthorizationURL, validateAuthorizationCode } from "../oauth2";

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
		id: "facebook",
		name: "Facebook",
		async createAuthorizationURL({ state, scopes, redirectURI }) {
			const _scopes = scopes || ["email", "public_profile"];
			options.scope && _scopes.push(...options.scope);
			return await createAuthorizationURL({
				id: "facebook",
				options,
				authorizationEndpoint: "https://www.facebook.com/v21.0/dialog/oauth",
				scopes: _scopes,
				state,
				redirectURI,
			});
		},
		validateAuthorizationCode: async ({ code, redirectURI }) => {
			return validateAuthorizationCode({
				code,
				redirectURI: options.redirectURI || redirectURI,
				options,
				tokenEndpoint: "https://graph.facebook.com/oauth/access_token",
			});
		},
		async verifyIdToken(token, nonce) {
			if (options.disableIdTokenSignIn) {
		            return false;
		        }
			
		        if (options.verifyIdToken) {
		            return options.verifyIdToken(token, nonce);
		        }
					 
			/* limited login */
			if (token.split('.')?.length) {
			  try {
			    const { payload } = await jwtVerify(
			      token,
			      createRemoteJWKSet(
				new URL(
				  'https://www.facebook.com/.well-known/oauth/openid/jwks'
				)
			      ),
			      {
				algorithms: ['RS256'],
				audience: options.clientId,
				issuer: 'https://www.facebook.com',
			      }
			    )
	      
			    if (nonce && payload.nonce !== nonce) {
              			return false;
		            }

			  } catch (error) {
			    return false
			  }
			}
		
			/* access_token */
			return true
		},
		async getUserInfo(token) {
			if (options.getUserInfo) {
				return options.getUserInfo(token);
			}
			const { data: profile, error } = await betterFetch<FacebookProfile>(
				"https://graph.facebook.com/me?fields=id,name,email,picture",
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
			const userMap = await options.mapProfileToUser?.(profile);
			return {
				user: {
					id: profile.id,
					name: profile.name,
					email: profile.email,
					image: profile.picture.data.url,
					emailVerified: profile.email_verified,
					...userMap,
				},
				data: profile,
			};
		},
	} satisfies OAuthProvider<FacebookProfile>;
};
