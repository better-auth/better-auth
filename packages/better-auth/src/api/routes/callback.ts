import { z } from "zod";
import { userSchema, type User } from "../../db/schema";
import { generateId } from "../../utils/id";
import { parseState } from "../../oauth2/state";
import { createAuthEndpoint } from "../call";
import { HIDE_METADATA } from "../../utils/hide-metadata";
import { setSessionCookie } from "../../cookies";
import { logger } from "../../utils/logger";
import type { OAuth2Tokens } from "../../oauth2";
import { handleOAuthUserInfo } from "../../oauth2/link-account";

export const callbackOAuth = createAuthEndpoint(
	"/callback/:id",
	{
		method: "GET",
		query: z.object({
			state: z.string(),
			code: z.string().optional(),
			error: z.string().optional(),
		}),
		metadata: HIDE_METADATA,
	},
	async (c) => {
		if (!c.query.code) {
			throw c.redirect(
				`${c.context.baseURL}/error?error=${c.query.error || "no_code"}`,
			);
		}
		const provider = c.context.socialProviders.find(
			(p) => p.id === c.params.id,
		);
		if (!provider) {
			c.context.logger.error(
				"Oauth provider with id",
				c.params.id,
				"not found",
			);
			throw c.redirect(
				`${c.context.baseURL}/error?error=oauth_provider_not_found`,
			);
		}
		const { codeVerifier, callbackURL, link, errorURL } = await parseState(c);
		let tokens: OAuth2Tokens;
		try {
			tokens = await provider.validateAuthorizationCode({
				code: c.query.code,
				codeVerifier,
				redirectURI: `${c.context.baseURL}/callback/${provider.id}`,
			});
		} catch (e) {
			c.context.logger.error(e);
			throw c.redirect(
				`${c.context.baseURL}/error?error=please_restart_the_process`,
			);
		}
		const userInfo = await provider
			.getUserInfo(tokens)
			.then((res) => res?.user);
		const id = generateId();
		const data = {
			id,
			...userInfo,
		};

		function redirectOnError(error: string) {
			let url = errorURL || callbackURL || `${c.context.baseURL}/error`;
			if (url.includes("?")) {
				url = `${url}&error=${error}`;
			} else {
				url = `${url}?error=${error}`;
			}
			throw c.redirect(url);
		}
		if (!userInfo) {
			logger.error("Unable to get user info");
			return redirectOnError("unable_to_get_user_info");
		}

		if (!data.email) {
			c.context.logger.error(
				"Provider did not return email. This could be due to misconfiguration in the provider settings.",
			);
			return redirectOnError("email_not_found");
		}

		if (!callbackURL) {
			logger.error("No callback URL found");
			throw c.redirect(
				`${c.context.baseURL}/error?error=please_restart_the_process`,
			);
		}
		if (link) {
			if (link.email !== data.email.toLowerCase()) {
				return redirectOnError("email_doesn't_match");
			}
			const newAccount = await c.context.internalAdapter.createAccount({
				userId: link.userId,
				providerId: provider.id,
				accountId: userInfo.id,
			});
			if (!newAccount) {
				return redirectOnError("unable_to_link_account");
			}
			let toRedirectTo: string;
			try {
				const url = new URL(callbackURL);
				toRedirectTo = url.toString();
			} catch {
				toRedirectTo = callbackURL;
			}
			throw c.redirect(toRedirectTo);
		}
    
		function redirectOnError(error: string) {
			throw c.redirect(
				`${
					errorURL || callbackURL || `${c.context.baseURL}/error`
				}?error=${error}`,
			);
		}

		const result = await handleOAuthUserInfo(c, {
			userInfo: data.data,
			account: {
				providerId: provider.id,
				accountId: userInfo.id,
				accessToken: tokens.accessToken,
				refreshToken: tokens.refreshToken,
				expiresAt: tokens.accessTokenExpiresAt,
			},
			callbackURL,
		});
		if (result.error) {
			return redirectOnError(result.error.split(" ").join("_"));
		}
		const { session, user } = result.data!;
		await setSessionCookie(c, {
			session,
			user,
		});
		let toRedirectTo: string;
		try {
			const url = new URL(callbackURL);
			toRedirectTo = url.toString();
		} catch {
			toRedirectTo = callbackURL;
		}
		throw c.redirect(toRedirectTo);
	},
);
