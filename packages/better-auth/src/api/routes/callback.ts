import { z } from "zod";
import { setSessionCookie } from "../../cookies";
import type { OAuth2Tokens } from "../../oauth2";
import { handleOAuthUserInfo } from "../../oauth2/link-account";
import { parseState } from "../../oauth2/state";
import { HIDE_METADATA } from "../../utils/hide-metadata";
import { createAuthEndpoint } from "../call";
import { safeJSONParse } from "../../utils/json";

const schema = z.object({
	code: z.string().optional(),
	error: z.string().optional(),
	device_id: z.string().optional(),
	error_description: z.string().optional(),
	state: z.string().optional(),
	user: z.string().optional(),
});

export const callbackOAuth = createAuthEndpoint(
	"/callback/:id",
	{
		method: ["GET", "POST"],
		body: schema.optional(),
		query: schema.optional(),
		metadata: HIDE_METADATA,
	},
	async (c) => {
		let queryOrBody: z.infer<typeof schema>;
		const defaultErrorURL =
			c.context.options.onAPIError?.errorURL || `${c.context.baseURL}/error`;
		try {
			if (c.method === "GET") {
				queryOrBody = schema.parse(c.query);
			} else if (c.method === "POST") {
				queryOrBody = schema.parse(c.body);
			} else {
				throw new Error("Unsupported method");
			}
		} catch (e) {
			c.context.logger.error("INVALID_CALLBACK_REQUEST", e);
			throw c.redirect(`${defaultErrorURL}?error=invalid_callback_request`);
		}

		const { code, error, state, error_description, device_id } = queryOrBody;

		if (error) {
			throw c.redirect(
				`${defaultErrorURL}?error=${error}&error_description=${error_description}`,
			);
		}

		if (!state) {
			c.context.logger.error("State not found", error);
			throw c.redirect(`${defaultErrorURL}?error=state_not_found`);
		}
		const {
			codeVerifier,
			callbackURL,
			link,
			errorURL,
			newUserURL,
			requestSignUp,
		} = await parseState(c);

		function redirectOnError(error: string) {
			let url = errorURL || defaultErrorURL;
			if (url.includes("?")) {
				url = `${url}&error=${error}`;
			} else {
				url = `${url}?error=${error}`;
			}
			throw c.redirect(url);
		}

		if (!code) {
			c.context.logger.error("Code not found");
			throw redirectOnError("no_code");
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
			throw redirectOnError("oauth_provider_not_found");
		}

		let tokens: OAuth2Tokens;
		try {
			tokens = await provider.validateAuthorizationCode({
				code: code,
				codeVerifier,
				deviceId: device_id,
				redirectURI: `${c.context.baseURL}/callback/${provider.id}`,
			});
		} catch (e) {
			c.context.logger.error("", e);
			throw redirectOnError("invalid_code");
		}
		const userInfo = await provider
			.getUserInfo({
				...tokens,
				user: c.body?.user ? safeJSONParse<any>(c.body.user) : undefined,
			})
			.then((res) => res?.user);

		if (!userInfo) {
			c.context.logger.error("Unable to get user info");
			return redirectOnError("unable_to_get_user_info");
		}

		if (!userInfo.email) {
			c.context.logger.error(
				"Provider did not return email. This could be due to misconfiguration in the provider settings.",
			);
			return redirectOnError("email_not_found");
		}

		if (!callbackURL) {
			c.context.logger.error("No callback URL found");
			throw redirectOnError("no_callback_url");
		}

		if (link) {
			const existingAccount = await c.context.internalAdapter.findAccount(
				userInfo.id,
			);

			if (existingAccount) {
				if (existingAccount.userId.toString() !== link.userId.toString()) {
					return redirectOnError("account_already_linked_to_different_user");
				}
				const updateData = Object.fromEntries(
					Object.entries({
						accessToken: tokens.accessToken,
						idToken: tokens.idToken,
						refreshToken: tokens.refreshToken,
						accessTokenExpiresAt: tokens.accessTokenExpiresAt,
						refreshTokenExpiresAt: tokens.refreshTokenExpiresAt,
						scope: tokens.scopes?.join(","),
					}).filter(([_, value]) => value !== undefined),
				);
				await c.context.internalAdapter.updateAccount(
					existingAccount.id,
					updateData,
				);
			} else {
				const newAccount = await c.context.internalAdapter.createAccount(
					{
						userId: link.userId,
						providerId: provider.id,
						accountId: userInfo.id,
						...tokens,
						scope: tokens.scopes?.join(","),
					},
					c,
				);
				if (!newAccount) {
					return redirectOnError("unable_to_link_account");
				}
			}
			let toRedirectTo: string;
			try {
				const url = callbackURL;
				toRedirectTo = url.toString();
			} catch {
				toRedirectTo = callbackURL;
			}
			throw c.redirect(toRedirectTo);
		}

		const result = await handleOAuthUserInfo(c, {
			userInfo: {
				...userInfo,
				email: userInfo.email,
				name: userInfo.name || userInfo.email,
			},
			account: {
				providerId: provider.id,
				accountId: userInfo.id,
				...tokens,
				scope: tokens.scopes?.join(","),
			},
			callbackURL,
			disableSignUp:
				(provider.disableImplicitSignUp && !requestSignUp) ||
				provider.options?.disableSignUp,
			overrideUserInfo: provider.options?.overrideUserInfoOnSignIn,
		});
		if (result.error) {
			c.context.logger.error(result.error.split(" ").join("_"));
			return redirectOnError(result.error.split(" ").join("_"));
		}
		const { session, user } = result.data!;
		await setSessionCookie(c, {
			session,
			user,
		});
		let toRedirectTo: string;
		try {
			const url = result.isRegister ? newUserURL || callbackURL : callbackURL;
			toRedirectTo = url.toString();
		} catch {
			toRedirectTo = result.isRegister
				? newUserURL || callbackURL
				: callbackURL;
		}
		throw c.redirect(toRedirectTo);
	},
);
