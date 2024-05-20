import { hmac } from "../crypto/hmac";
import type { BetterAuthPlugin } from "./types";

import { generateRandomString } from "../crypto/random";
import type { Context, InternalResponse } from "../routes/types";

const csrfHandler = async (context: Context) => {
	const csrfToken = context.request.cookies.get(context.cookies.csrfToken.name);
	if (csrfToken) {
		return {
			status: 200,
			body: {
				csrfToken,
			},
		};
	}
	const token = generateRandomString(32);
	const hash = await hmac(context.secret, token);
	const cookie = `${token}!${hash}`;
	context.request.cookies.set(
		context.cookies.csrfToken.name,
		cookie,
		context.cookies.csrfToken.options,
	);
	return {
		status: 200,
		body: {
			csrfToken: cookie,
		},
	} satisfies InternalResponse;
};

export const CSRFCheckPlugin = (): BetterAuthPlugin => {
	return {
		id: "csrf",
		name: "CSRF Check",
		version: "1.0.0",
		hooks: {
			matcher: (context) => !context.disableCSRF,
			before: async (context) => {
				const csrfToken = context.request.body.csrfToken;
				const csrfCookie = context.request.cookies.get(
					context.cookies.csrfToken.name,
				);
				const [token, hash] = csrfCookie?.split("!") || [null, null];
				if (
					!csrfToken ||
					!csrfCookie ||
					!token ||
					!hash ||
					csrfCookie !== csrfToken
				) {
					context.request.cookies.set(context.cookies.csrfToken.name, "", {
						...context.cookies.csrfToken.options,
						maxAge: 0,
					});
					return {
						response: {
							status: 403,
							statusText: "Invalid CSRF Token",
						},
					};
				}
				const expectedHash = await hmac(context.secret, token);

				if (hash !== expectedHash) {
					context.request.cookies.set(context.cookies.csrfToken.name, "", {
						...context.cookies.csrfToken.options,
						maxAge: 0,
					});
					return {
						response: {
							status: 403,
							statusText: "Invalid CSRF Token",
						},
					};
				}
				return null;
			},
		},
		handler: csrfHandler,
	};
};
