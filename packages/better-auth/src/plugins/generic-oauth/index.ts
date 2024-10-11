import { z } from "zod";
import { APIError } from "better-call";
import type { BetterAuthPlugin } from "../../types";
import { createAuthEndpoint } from "../../api";
import { betterFetch } from "@better-fetch/fetch";
import { generateState } from "../../utils/state";
import { generateCodeVerifier } from "oslo/oauth2";

interface GenericOAuthConfig {
	providerId: string;
	discoveryUrl?: string;
	authorizationUrl?: string;
	tokenUrl?: string;
	clientId: string;
	clientSecret: string;
	scopes?: string[];
	redirectURI?: string;
	responseType?: string;
	prompt?: string;
	pkce?: boolean;
	accessType?: string;
}

interface GenericOAuthOptions {
	config: GenericOAuthConfig[];
}

/**
 * A generic OAuth plugin that can be used to add OAuth support to any provider
 */
export const genericOAuth = (options: GenericOAuthOptions) => {
	return {
		id: "generic-oauth",
		endpoints: {
			signInWithOAuth2: createAuthEndpoint(
				"/sign-in/oauth2",
				{
					method: "POST",
					query: z
						.object({
							/**
							 * Redirect to the current URL after the
							 * user has signed in.
							 */
							currentURL: z.string().optional(),
						})
						.optional(),
					body: z.object({
						providerId: z.string(),
						callbackURL: z.string().optional(),
					}),
				},
				async (ctx) => {
					const { providerId } = ctx.body;
					const config = options.config.find(
						(c) => c.providerId === providerId,
					);
					if (!config) {
						throw new APIError("BAD_REQUEST", {
							message: `No config found for provider ${providerId}`,
						});
					}
					const {
						discoveryUrl,
						authorizationUrl,
						tokenUrl,
						clientId,
						clientSecret,
						scopes,
						redirectURI,
						responseType,
						pkce,
						prompt,
						accessType,
					} = config;
					let finalAuthUrl = authorizationUrl;
					let finalTokenUrl = tokenUrl;
					if (discoveryUrl) {
						const discovery = await betterFetch<{
							authorization_endpoint: string;
							token_endpoint: string;
						}>(discoveryUrl);
						if (discovery.data) {
							finalAuthUrl = discovery.data.authorization_endpoint;
							finalTokenUrl = discovery.data.token_endpoint;
						}
					}
					if (!finalAuthUrl || !finalTokenUrl) {
						throw new APIError("BAD_REQUEST", {
							message: "Invalid OAuth configuration.",
						});
					}

					const currentURL = ctx.query?.currentURL
						? new URL(ctx.query?.currentURL)
						: null;
					const callbackURL = ctx.body.callbackURL?.startsWith("http")
						? ctx.body.callbackURL
						: `${currentURL?.origin}${ctx.body.callbackURL || ""}`;
					const state = generateState(
						callbackURL || currentURL?.origin || ctx.context.baseURL,
						ctx.query?.currentURL,
					);
					const cookie = ctx.context.authCookies;
					await ctx.setSignedCookie(
						cookie.state.name,
						state.code,
						ctx.context.secret,
						cookie.state.options,
					);
					const codeVerifier = generateCodeVerifier();
					await ctx.setSignedCookie(
						cookie.pkCodeVerifier.name,
						codeVerifier,
						ctx.context.secret,
						cookie.pkCodeVerifier.options,
					);

					const authUrl = new URL(finalAuthUrl!);
					authUrl.searchParams.append("client_id", clientId);
					authUrl.searchParams.append(
						"redirect_uri",
						redirectURI ||
							`${ctx.context.baseURL}/oauth2/callback/${providerId}`,
					);
					authUrl.searchParams.append("response_type", responseType || "code");
					if (scopes) authUrl.searchParams.append("scope", scopes.join(" "));
					if (prompt) authUrl.searchParams.append("prompt", prompt);
					if (accessType)
						authUrl.searchParams.append("access_type", accessType);
					if (pkce) {
						authUrl.searchParams.append("code_challenge", codeVerifier);
						authUrl.searchParams.append("code_challenge_method", "S256");
					}

					ctx.setSignedCookie(
						ctx.context.authCookies.state.name,
						state.code,
						ctx.context.secret,
					);
					return {
						url: authUrl.toString(),
						state: state.state,
						codeVerifier,
						redirect: true,
					};
				},
			),
		},
	} satisfies BetterAuthPlugin;
};
