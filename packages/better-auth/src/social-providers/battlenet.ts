import { betterFetch } from "@better-fetch/fetch";
import type { OAuthProvider, ProviderOptions } from "../oauth2";
import { createAuthorizationURL, validateAuthorizationCode } from "../oauth2";

export interface BattleNetProfile {
  id: string;
  battletag: string;
  sub: string;
}

export interface BattleNetOptions extends ProviderOptions<BattleNetProfile> {
  region?: "us" | "eu" | "kr" | "tw" | "cn";
}

export const battlenet = (options: BattleNetOptions) => {
  const region = options.region || "us";
  const authorizationEndpoint = region === 'cn' ? 'https://oauth.battlenet.com.cn/authorize' : 'https://oauth.battle.net/authorize';
  const tokenEndpoint = region === 'cn' ? 'https://oauth.battlenet.com.cn/token' : 'https://oauth.battle.net/token';

  return {
    id: "battlenet",
    name: "Battle.net",
    createAuthorizationURL({ state, scopes, codeVerifier, redirectURI }) {
      const _scopes = options.disableDefaultScope ? [] : ["openid"];
      options.scope && _scopes.push(...options.scope);
      scopes && _scopes.push(...scopes);
      
      return createAuthorizationURL({
        id: "battlenet",
        options,
        authorizationEndpoint,
        scopes: _scopes,
        state,
        codeVerifier,
        redirectURI,
      });
    },
    validateAuthorizationCode: async ({ code, redirectURI, codeVerifier }) => {
      return validateAuthorizationCode({
        code,
        redirectURI,
        codeVerifier,
        options,
        tokenEndpoint,
        authentication: "basic",
      });
    },
    async getUserInfo(token) {
      if (options.getUserInfo) {
        return options.getUserInfo(token);
      }
      
      const { data: profile, error } = await betterFetch<BattleNetProfile>(
        'https://oauth.battle.net/userinfo',
        {
          headers: {
            "User-Agent": "better-auth",
            authorization: `Bearer ${token.accessToken}`,
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
          name: profile.battletag,
          email: '-', // Battle.net doesn't provide email
          emailVerified: false,
          ...userMap,
        },
        data: profile,
      };
    },
  } satisfies OAuthProvider<BattleNetProfile>;
};
