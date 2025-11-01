import { createAuthEndpoint } from "@better-auth/core/api";
import type { OAuth2Tokens } from "@better-auth/core/oauth2";
import * as z from "zod";
import { setSessionCookie } from "../../cookies";
import { handleOAuthUserInfo } from "../../oauth2/link-account";
import { parseState } from "../../oauth2/state";
import { setTokenUtil } from "../../oauth2/utils";
import { HIDE_METADATA } from "../../utils/hide-metadata";
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
			const errorParams = { error: "invalid_callback_request" };
			const errorURLConfig = c.context.options.onAPIError?.errorURL;
			let baseURL: string;

			if (typeof errorURLConfig === "function") {
				baseURL = await errorURLConfig(errorParams);
			} else {
				baseURL = errorURLConfig || `${c.context.baseURL}/error`;
			}
			const params = new URLSearchParams({ error: errorParams.error });
			const sep = baseURL.includes("?") ? "&" : "?";
			const finalURL = `${baseURL}${sep}${params.toString()}`;
			throw c.redirect(finalURL);
		}

		const { code, error, state, error_description, device_id } = queryOrBody;

		if (!state) {
			c.context.logger.error("State not found", error);
			const errorParams = { error: "state_not_found" };
			const errorURLConfig = c.context.options.onAPIError?.errorURL;
			let baseURL: string;

			if (typeof errorURLConfig === "function") {
				baseURL = await errorURLConfig(errorParams);
			} else {
				baseURL = errorURLConfig || `${c.context.baseURL}/error`;
			}

			const params = new URLSearchParams({ error: errorParams.error });
			const finalSep = baseURL.includes("?") ? "&" : "?"; // Use a different name to avoid conflict
			const finalURL = `${baseURL}${finalSep}${params.toString()}`;
			throw c.redirect(finalURL);
		}

		const {
			codeVerifier,
			callbackURL,
			link,
			errorURL,
			newUserURL,
			requestSignUp,
		} = await parseState(c);

		async function redirectOnError(
			error: string,
			description?: string | undefined,
		) {
			const errorParams = { error, error_description: description };
			let baseURL: string;

			// 'errorURL' here comes from parseState and is a string, it takes priority
			if (errorURL) {
				baseURL = errorURL;
			} else {
				// Fallback to global config
				const errorURLConfig = c.context.options.onAPIError?.errorURL;
				if (typeof errorURLConfig === "function") {
					baseURL = await errorURLConfig(errorParams);
				} else {
					baseURL = errorURLConfig || `${c.context.baseURL}/error`;
				}
			}

			const params = new URLSearchParams();
			params.set("error", error);
			if (description) params.set("error_description", description);

			const sep = baseURL.includes("?") ? "&" : "?";
			const url = `${baseURL}${sep}${params.toString()}`;

			throw c.redirect(url);
		}

		if (error) {
			await redirectOnError(error, error_description);
			return null as never;
		}

		if (!code) {
			c.context.logger.error("Code not found");
			await redirectOnError("no_code");
			return null as never;
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
			await redirectOnError("oauth_provider_not_found");
			return null as never;
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
			await redirectOnError("invalid_code");
			return null as never;
		}
		const userInfo = await provider
			.getUserInfo({
				...tokens,
				user: c.body?.user ? safeJSONParse<any>(c.body.user) : undefined,
			})
			.then((res) => res?.user);

		if (!userInfo) {
			c.context.logger.error("Unable to get user info");
			return await redirectOnError("unable_to_get_user_info");
		}

		if (!callbackURL) {
			c.context.logger.error("No callback URL found");
			await redirectOnError("no_callback_url");
			return null as never;
		}

		if (link) {
			const trustedProviders =
				c.context.options.account?.accountLinking?.trustedProviders;
			const isTrustedProvider = trustedProviders?.includes(
				provider.id as "apple",
			);
			if (
				(!isTrustedProvider && !userInfo.emailVerified) ||
				c.context.options.account?.accountLinking?.enabled === false
			) {
				c.context.logger.error("Unable to link account - untrusted provider");
				return await redirectOnError("unable_to_link_account");
			}

			if (
				userInfo.email !== link.email &&
				c.context.options.account?.accountLinking?.allowDifferentEmails !== true
			) {
				return await redirectOnError("email_doesn't_match");
			}

			const existingAccount = await c.context.internalAdapter.findAccount(
				String(userInfo.id),
			);

			if (existingAccount) {
				if (existingAccount.userId.toString() !== link.userId.toString()) {
					return await redirectOnError(
						"account_already_linked_to_different_user",
					);
				}
				const updateData = Object.fromEntries(
					Object.entries({
						accessToken: await setTokenUtil(tokens.accessToken, c.context),
						refreshToken: await setTokenUtil(tokens.refreshToken, c.context),
						idToken: tokens.idToken,
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
				const newAccount = await c.context.internalAdapter.createAccount({
					userId: link.userId,
					providerId: provider.id,
					accountId: String(userInfo.id),
					...tokens,
					accessToken: await setTokenUtil(tokens.accessToken, c.context),
					refreshToken: await setTokenUtil(tokens.refreshToken, c.context),
					scope: tokens.scopes?.join(","),
				});
				if (!newAccount) {
					return await redirectOnError("unable_to_link_account");
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

		if (!userInfo.email) {
			c.context.logger.error(
				"Provider did not return email. This could be due to misconfiguration in the provider settings.",
			);
			return await redirectOnError("email_not_found");
		}

		const result = await handleOAuthUserInfo(c, {
			userInfo: {
				...userInfo,
				id: String(userInfo.id),
				email: userInfo.email,
				name: userInfo.name || userInfo.email,
			},
			account: {
				providerId: provider.id,
				accountId: String(userInfo.id),
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
			return await redirectOnError(result.error.split(" ").join("_"));
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
