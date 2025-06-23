import { betterFetch } from "@better-fetch/fetch";
import { BetterAuthError } from "../error";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import { refreshAccessToken } from "../oauth2";
import { logger } from "../utils/logger";
import { createAuthorizationURL, validateAuthorizationCode } from "../oauth2";

export interface FaceitProfile {
  guid: string;
  name: string;
  email: string;
  picture: string;
}

export interface FaceitOptions extends ProviderOptions<FaceitProfile> {}

export const faceit = (options: FaceitOptions) => {
  return {
    id: "faceit",
    name: "FACEIT",

    async createAuthorizationURL({ state, scopes, codeVerifier, redirectURI }) {
      if (!options.clientId || !options.clientSecret) {
        logger.error(
          "Client ID and Client Secret are required for FACEIT. Make sure to provide them in the options."
        );
        throw new BetterAuthError("CLIENT_ID_AND_SECRET_REQUIRED");
      }
      if (!codeVerifier) {
        throw new BetterAuthError("codeVerifier is required for FACEIT");
      }

      const _scopes = options.disableDefaultScope
        ? []
        : ["openid", "email", "profile"];

      options.responseMode = "query";

      options.scope && _scopes.push(...options.scope);
      scopes && _scopes.push(...scopes);

      const url = await createAuthorizationURL({
        id: "faceit",
        options,
        authorizationEndpoint:
          "https://accounts.faceit.com/accounts?redirect_popup=true",
        scopes: _scopes,
        state,
        codeVerifier,
        redirectURI,
      });
      return url;
    },

    validateAuthorizationCode: async ({ code, codeVerifier, redirectURI }) => {
      const res = await validateAuthorizationCode({
        code,
        codeVerifier,
        redirectURI,
        options,
        tokenEndpoint: "https://api.faceit.com/auth/v1/oauth/token",
        headers: {
          Authorization: `Basic ${Buffer.from(
            `${options.clientId}:${options.clientSecret}`
          ).toString("base64")}`,
        },
      });
      return res;
    },

    refreshAccessToken: options.refreshAccessToken
      ? options.refreshAccessToken
      : async (refreshToken) => {
          return refreshAccessToken({
            refreshToken,
            options: {
              clientId: options.clientId,
              clientKey: options.clientKey,
              clientSecret: options.clientSecret,
            },
            tokenEndpoint: "https://api.faceit.com/auth/v1/oauth/token",
            authentication: "basic",
          });
        },

    async getUserInfo(token) {
      if (options.getUserInfo) {
        return options.getUserInfo(token);
      }

      const { data: profile } = await betterFetch<FaceitProfile>(
        "https://api.faceit.com/auth/v1/resources/userinfo",
        {
          headers: {
            authorization: `Bearer ${token.accessToken}`,
          },
        }
      );
      if (!profile) {
        return null;
      }

      const userMap = await options.mapProfileToUser?.(profile);

      return {
        user: {
          id: profile.guid,
          name: profile.name,
          email: profile.email,
          image: profile.picture,
          emailVerified: false, // Explicitly set emailVerified
          ...userMap,
        },
        data: profile,
      };
    },
    options,
  } satisfies OAuthProvider<FaceitProfile>;
};
