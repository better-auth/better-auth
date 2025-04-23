import type { OAuthProvider, ProviderOptions } from "../oauth2";
import {
  createAuthorizationURL,
  validateAuthorizationCode,
  refreshAccessToken,
} from "../oauth2";
import { betterFetch } from "@better-fetch/fetch";

export interface FigmaProfile {
  id: string;
  handle: string;
  img_url: string;
  email: string;
}

export interface FigmaOptions extends ProviderOptions<FigmaProfile> {}

export const figma = (options: FigmaOptions) => {
  const tokenEndpoint = "https://www.figma.com/api/oauth/token";

  return {
    id: "figma",
    name: "Figma",

    createAuthorizationURL({ state, scopes, redirectURI }) {
      const _scopes = options.disableDefaultScope ? [] : ["file_read"];
      options.scope && _scopes.push(...options.scope);
      scopes && _scopes.push(...scopes);

      return createAuthorizationURL({
        id: "figma",
        options,
        authorizationEndpoint: "https://www.figma.com/oauth",
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
        tokenEndpoint,
      });
    },

    refreshAccessToken: options.refreshAccessToken
      ? options.refreshAccessToken
      : async (refreshToken) => {
          return refreshAccessToken({
            refreshToken,
            options: {
              clientId: options.clientId,
              clientSecret: options.clientSecret,
            },
            tokenEndpoint,
          });
        },

    async getUserInfo(token) {
      if (options.getUserInfo) {
        return options.getUserInfo(token);
      }

      const { data: profile, error } = await betterFetch<{ user: FigmaProfile }>(
        "https://api.figma.com/v1/me",
        {
          headers: {
            Authorization: `Bearer ${token.accessToken}`,
          },
        }
      );

      if (error || !profile?.user) return null;

      const user = profile.user;
      const userMap = await options.mapProfileToUser?.(user);

      return {
        user: {
          id: user.id,
          name: user.handle,
          email: user.email,
          image: user.img_url,
          emailVerified: true,
          ...userMap,
        },
        data: user,
      };
    },

    options,
  } satisfies OAuthProvider<FigmaProfile>;
};
