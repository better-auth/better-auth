import { APIError } from "better-call";
import { z } from "zod";
import { userSchema } from "../../adapters/schema";
import { generateId } from "../../utils/id";
import { parseState } from "../../utils/state";
import { createAuthEndpoint } from "../call";
import { HIDE_ON_CLIENT_METADATA } from "../../client/client-utils";
import { getAccountTokens } from "../../utils/getAccount";
import { setSessionCookie } from "../../utils/cookies";
import type { OAuth2Tokens } from "arctic";

export const callbackOAuth = createAuthEndpoint(
	"/callback/:id",
	{
		method: "GET",
		query: z.object({
			state: z.string(),
			code: z.string(),
		}),
		metadata: HIDE_ON_CLIENT_METADATA,
	},
	async (c) => {
		const provider = c.context.options.socialProvider?.find(
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
		const codeVerifier = await c.getSignedCookie(
			c.context.authCookies.pkCodeVerifier.name,
			c.context.secret,
		);
		let tokens: OAuth2Tokens;
		try {
			tokens = await provider.validateAuthorizationCode(
				c.query.code,
				codeVerifier,
				`${c.context.baseURL}/callback/${provider.id}`,
			);
		} catch (e) {
			c.context.logger.error("Code verification failed", e);
			throw c.redirect(
				`${c.context.baseURL}/error?error=oauth_code_verification_failed`,
			);
		}
		if (!tokens) {
			c.context.logger.error("Code verification failed");
			throw c.redirect(
				`${c.context.baseURL}/error?error=oauth_code_verification_failed`,
			);
		}
		const user = await provider.getUserInfo(tokens).then((res) => res?.user);
		const id = generateId();
		const data = userSchema.safeParse({
			...user,
			id,
		});
		const parsedState = parseState(c.query.state);
		if (!parsedState.success) {
			c.context.logger.error("Unable to parse state");
			throw c.redirect(
				`${c.context.baseURL}/error?error=invalid_state_parameter`,
			);
		}
		const { callbackURL, currentURL, dontRememberMe } = parsedState.data;
		if (!user || data.success === false) {
			throw c.redirect(
				`${c.context.baseURL}/error?error=oauth_validation_failed`,
			);
		}
		if (!callbackURL) {
			throw c.redirect(
				`${c.context.baseURL}/error?error=oauth_callback_url_not_found`,
			);
		}
		//find user in db
		const dbUser = await c.context.internalAdapter.findUserByEmail(user.email);
		const userId = dbUser?.user.id;
		if (dbUser) {
			//check if user has already linked this provider
			const hasBeenLinked = dbUser.accounts.find(
				(a) => a.providerId === provider.id,
			);
			if (!hasBeenLinked && !user.emailVerified) {
				c.context.logger.error("User already exists");
				const url = new URL(currentURL || callbackURL);
				url.searchParams.set("error", "user_already_exists");
				throw c.redirect(url.toString());
			}

			if (!hasBeenLinked && user.emailVerified) {
				await c.context.internalAdapter.linkAccount({
					providerId: provider.id,
					accountId: user.id,
					id: `${provider.id}:${user.id}`,
					userId: dbUser.user.id,
					...getAccountTokens(tokens),
				});
			}
		} else {
			try {
				await c.context.internalAdapter.createOAuthUser(data.data, {
					...getAccountTokens(tokens),
					id: `${provider.id}:${user.id}`,
					providerId: provider.id,
					accountId: user.id,
					userId: id,
				});
			} catch (e) {
				const url = new URL(currentURL || callbackURL);
				url.searchParams.set("error", "unable_to_create_user");
				c.setHeader("Location", url.toString());
				throw c.redirect(url.toString());
			}
		}
		//this should never happen
		if (!userId && !id)
			throw new APIError("INTERNAL_SERVER_ERROR", {
				message: "Unable to create user",
			});
		//create session
		const session = await c.context.internalAdapter.createSession(
			userId || id,
			c.request,
			dontRememberMe,
		);
		try {
			await setSessionCookie(c, session.id, dontRememberMe);
		} catch (e) {
			c.context.logger.error("Unable to set session cookie", e);
			const url = new URL(currentURL || callbackURL);
			url.searchParams.set("error", "unable_to_create_session");
			throw c.redirect(url.toString());
		}

		throw c.redirect(callbackURL);
	},
);
