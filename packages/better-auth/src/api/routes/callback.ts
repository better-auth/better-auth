import { createAuthEndpoint } from "@better-auth/core/api";
import { appendQueryParams } from "@better-auth/core/utils/url";
import * as z from "zod";
import { getAwaitableValue } from "../../context/helpers";
import { setSessionCookie } from "../../cookies";
import { exchangeOAuthCallback } from "../../oauth2/callback";
import {
	missingEmailLogMessage,
	OAUTH_CALLBACK_ERROR_CODES,
} from "../../oauth2/errors";
import {
	handleOAuthUserInfo,
	linkOAuthAccount,
} from "../../oauth2/link-account";
import {
	generateIdTokenNonce,
	generateState,
	parseState,
} from "../../oauth2/state";
import { getOAuthCallbackPath } from "../../oauth2/utils";
import { HIDE_METADATA } from "../../utils/hide-metadata";
import { isAPIError } from "../../utils/is-api-error";

const schema = z.object({
	code: z.string().optional(),
	error: z.string().optional(),
	device_id: z.string().optional(),
	error_description: z.string().optional(),
	state: z.string().optional(),
	user: z.string().optional(),
	iss: z.string().optional(),
});

export const callbackOAuth = createAuthEndpoint(
	"/callback/:id",
	{
		method: ["GET", "POST"],
		operationId: "handleOAuthCallback",
		body: schema.optional(),
		query: schema.optional(),
		metadata: {
			...HIDE_METADATA,
			allowedMediaTypes: [
				"application/x-www-form-urlencoded",
				"application/json",
			],
		},
	},
	async (c) => {
		let queryOrBody: z.infer<typeof schema>;
		const defaultErrorURL =
			c.context.options.onAPIError?.errorURL || `${c.context.baseURL}/error`;

		// Handle POST requests by redirecting to GET to ensure cookies are sent
		if (c.method === "POST") {
			const postData = c.body ? schema.parse(c.body) : {};
			const queryData = c.query ? schema.parse(c.query) : {};

			const mergedData = schema.parse({ ...postData, ...queryData });
			const params = new URLSearchParams();

			for (const [key, value] of Object.entries(mergedData)) {
				if (value !== undefined && value !== null) {
					params.set(key, String(value));
				}
			}

			const redirectURL = `${c.context.baseURL}/callback/${c.params.id}?${params.toString()}`;
			throw c.redirect(redirectURL);
		}

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
			const params = new URLSearchParams({
				error: "invalid_callback_request",
			});
			const redirectURL = appendQueryParams(defaultErrorURL, params);

			throw c.redirect(redirectURL);
		}

		const {
			code,
			error,
			state,
			error_description,
			device_id,
			user: userData,
			iss,
		} = queryOrBody;

		if (state === undefined && code) {
			const provider = await getAwaitableValue(c.context.socialProviders, {
				value: c.params.id,
			});
			if (provider?.allowIdpInitiated) {
				const idTokenNonce = generateIdTokenNonce(provider);
				const { state: freshState, codeVerifier } = await generateState(c, {
					idTokenNonce,
				});
				const authUrl = await provider.createAuthorizationURL({
					state: freshState,
					codeVerifier,
					idTokenNonce,
					redirectURI: `${c.context.baseURL}${getOAuthCallbackPath(provider)}`,
				});
				throw c.redirect(authUrl.toString());
			}
		}

		if (!state) {
			c.context.logger.error("State not found", error);
			const params = new URLSearchParams({ error: "state_not_found" });
			const redirectURL = appendQueryParams(defaultErrorURL, params);

			throw c.redirect(redirectURL);
		}

		const {
			codeVerifier,
			callbackURL,
			link,
			errorURL,
			newUserURL,
			requestSignUp,
			idTokenNonce,
		} = await parseState(c);

		function redirectOnError(error: string, description?: string | undefined) {
			const baseURL = errorURL ?? defaultErrorURL;

			const params = new URLSearchParams({ error });
			if (description) params.set("error_description", description);

			const redirectURL = appendQueryParams(baseURL, params);

			throw c.redirect(redirectURL);
		}

		if (error) {
			redirectOnError(error, error_description);
		}

		if (!code) {
			c.context.logger.warn("Code not found");
			throw redirectOnError(OAUTH_CALLBACK_ERROR_CODES.NO_CODE);
		}

		const provider = await getAwaitableValue(c.context.socialProviders, {
			value: c.params.id,
		});

		if (!provider) {
			c.context.logger.warn("OAuth provider not found", {
				providerId: c.params.id,
			});
			throw redirectOnError(OAUTH_CALLBACK_ERROR_CODES.PROVIDER_NOT_FOUND);
		}

		const exchanged = await exchangeOAuthCallback(c, provider, {
			code,
			codeVerifier,
			iss,
			deviceId: device_id,
			user: userData,
			idTokenNonce,
		});
		if (exchanged.error) {
			throw redirectOnError(exchanged.error);
		}
		const { tokens, userInfo, providerProfile, accountKey } = exchanged;
		const { accountId } = accountKey;

		if (!callbackURL) {
			c.context.logger.error("No callback URL found");
			throw redirectOnError(OAUTH_CALLBACK_ERROR_CODES.NO_CALLBACK_URL);
		}
		const accountData = {
			...accountKey,
			...tokens,
			scope: tokens.scopes?.join(","),
		};

		if (link) {
			const linkResult = await linkOAuthAccount(c, {
				link,
				userInfo,
				account: accountData,
				profile: providerProfile,
				scopes: tokens.scopes,
			});
			if (!linkResult.linked) {
				return redirectOnError(linkResult.error.code, linkResult.error.message);
			}
			throw c.redirect(callbackURL);
		}

		if (!userInfo.email) {
			c.context.logger.error(missingEmailLogMessage(provider.id));
			return redirectOnError(OAUTH_CALLBACK_ERROR_CODES.EMAIL_NOT_FOUND);
		}
		let result: Awaited<ReturnType<typeof handleOAuthUserInfo>>;
		try {
			result = await handleOAuthUserInfo(c, {
				userInfo: {
					...userInfo,
					id: accountId,
					email: userInfo.email,
					name: userInfo.name || "",
				},
				account: accountData,
				callbackURL,
				disableSignUp:
					(provider.disableImplicitSignUp && !requestSignUp) ||
					provider.options?.disableSignUp,
				overrideUserInfo: provider.options?.overrideUserInfoOnSignIn,
				source: {
					method: "oauth",
					oauth: { providerId: provider.id, profile: providerProfile },
				},
			});
		} catch (e) {
			// App-defined rejection codes are forwarded verbatim rather than mapped
			// onto OAUTH_CALLBACK_ERROR_CODES.
			if (isAPIError(e) && e.body?.code) {
				redirectOnError(e.body.code, e.body.message);
			}
			throw e;
		}
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
