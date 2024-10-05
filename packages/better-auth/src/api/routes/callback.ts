import { APIError } from "better-call";
import { z } from "zod";
import { userSchema } from "../../db/schema";
import { generateId } from "../../utils/id";
import { parseState } from "../../utils/state";
import { createAuthEndpoint } from "../call";
import { HIDE_METADATA } from "../../utils/hide-metadata";
import { getAccountTokens } from "../../utils/getAccount";
import { setSessionCookie } from "../../utils/cookies";
import type { OAuth2Tokens } from "arctic";
import { logger } from "../../utils/logger";

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
		if (c.query.error || !c.query.code) {
			const parsedState = parseState(c.query.state);
			const callbackURL =
				parsedState.data?.callbackURL || `${c.context.baseURL}/error`;
			c.context.logger.error(c.query.error, c.params.id);
			throw c.redirect(
				`${callbackURL}?error=${c.query.error || "oAuth_code_missing"}`,
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
			c.context.logger.error(e);
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
			logger.error("Unable to get user info", data.error);
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
		const dbUser = await c.context.internalAdapter
			.findUserByEmail(user.email)
			.catch((e) => {
				logger.error(
					"Better auth was unable to query your database.\nError: ",
					e,
				);
				throw c.redirect(
					`${c.context.baseURL}/error?error=internal_server_error`,
				);
			});

		const userId = dbUser?.user.id;
		if (dbUser) {
			//check if user has already linked this provider
			const hasBeenLinked = dbUser.accounts.find(
				(a) => a.providerId === provider.id,
			);
			const trustedProviders =
				c.context.options.account?.accountLinking?.trustedProviders;
			const isTrustedProvider = trustedProviders
				? trustedProviders.includes(provider.id as "apple")
				: true;

			if (!hasBeenLinked && (!user.emailVerified || !isTrustedProvider)) {
				let url: URL;
				try {
					url = new URL(currentURL || callbackURL);
					url.searchParams.set("error", "account_not_linked");
				} catch (e) {
					throw c.redirect(
						`${c.context.baseURL}/error?error=account_not_linked`,
					);
				}
				throw c.redirect(url.toString());
			}

			if (!hasBeenLinked) {
				try {
					await c.context.internalAdapter.linkAccount({
						providerId: provider.id,
						accountId: user.id.toString(),
						id: `${provider.id}:${user.id}`,
						userId: dbUser.user.id,
						...getAccountTokens(tokens),
					});
				} catch (e) {
					console.log(e);
					throw c.redirect(
						`${c.context.baseURL}/error?error=failed_linking_account`,
					);
				}
			}
		} else {
			try {
				await c.context.internalAdapter.createOAuthUser(data.data, {
					...getAccountTokens(tokens),
					id: `${provider.id}:${user.id}`,
					providerId: provider.id,
					accountId: user.id.toString(),
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
		try {
			const session = await c.context.internalAdapter.createSession(
				userId || id,
				c.request,
				dontRememberMe,
			);
			if (!session) {
				const url = new URL(currentURL || callbackURL);
				url.searchParams.set("error", "unable_to_create_session");
				throw c.redirect(url.toString());
			}
			try {
				await setSessionCookie(c, session.id, dontRememberMe);
			} catch (e) {
				c.context.logger.error("Unable to set session cookie", e);
				const url = new URL(currentURL || callbackURL);
				url.searchParams.set("error", "unable_to_create_session");
				throw c.redirect(url.toString());
			}
		} catch {
			const url = new URL(currentURL || callbackURL);
			url.searchParams.set("error", "unable_to_create_session");
			throw c.redirect(url.toString());
		}
		throw c.redirect(callbackURL);
	},
);
