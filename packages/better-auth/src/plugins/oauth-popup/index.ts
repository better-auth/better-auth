import type {
	BetterAuthPlugin,
	GenericEndpointContext,
} from "@better-auth/core";
import {
	createAuthEndpoint,
	createAuthMiddleware,
} from "@better-auth/core/api";
import { APIError, BASE_ERROR_CODES } from "@better-auth/core/error";
import { safeJSONParse } from "@better-auth/core/utils/json";
import * as z from "zod";
import { setOAuthState } from "../../api/state/oauth";
import { getAwaitableValue } from "../../context/helpers";
import {
	expireCookie,
	parseSetCookieHeader,
	splitSetCookieHeader,
} from "../../cookies";
import { generateRandomString } from "../../crypto";
import type { StateData } from "../../state";
import { generateGenericState, INTERNAL_STATE_KEYS } from "../../state";
import { HIDE_METADATA } from "../../utils/hide-metadata";
import { PACKAGE_VERSION } from "../../version";
import {
	OAUTH_POPUP_DATA_ELEMENT_ID,
	OAUTH_POPUP_MESSAGE_TYPE,
	POPUP_MARKER_COOKIE,
} from "./constants";
import { OAUTH_POPUP_ERROR_CODES } from "./error-codes";
import type { OAuthPopupData } from "./types";

declare module "@better-auth/core" {
	interface BetterAuthPluginRegistry<AuthOptions, Options> {
		"oauth-popup": {
			creator: typeof oauthPopup;
		};
	}
}

let warnedMissingBearer = false;

/**
 * Escapes `</script>` and JS line separators for embedding in a script element.
 */
function inlineJSON(value: unknown): string {
	return JSON.stringify(value).replace(
		/[<\u2028\u2029]/g,
		(c) => `\\u${c.charCodeAt(0).toString(16).padStart(4, "0")}`,
	);
}

/**
 * The completion-page script.
 */
export const OAUTH_POPUP_COMPLETE_SCRIPT = `(function () {
	var el = document.getElementById(${JSON.stringify(OAUTH_POPUP_DATA_ELEMENT_ID)});
	if (!el) return;
	var payload;
	try {
		payload = JSON.parse(el.textContent || "");
	} catch (e) {
		return;
	}
	var target = window.opener || window.parent;
	if (target && target !== window) {
		try {
			target.postMessage(
				{
					type: payload.type,
					nonce: payload.nonce,
					token: payload.token,
					redirectTo: payload.redirectTo,
					error: payload.error,
				},
				payload.targetOrigin,
			);
		} catch (e) {}
	}
	window.close();
})();
`;

/**
 * sha256 of `OAUTH_POPUP_COMPLETE_SCRIPT`, pinned in the completion CSP.
 */
export const OAUTH_POPUP_SCRIPT_CSP_HASH =
	"sha256-tIo2K8VBC9SnhvdZ+9GsGkQoZm+jm/JcxL+d+i8b8KQ=";

/**
 * Renders the page that posts the outcome (token or error) to the opener. The
 * caller must pass a trusted `popupOrigin` — validated at `/oauth-popup/start`
 * and preserved in the signed marker cookie the callback reads.
 */
function renderCompletion(
	c: GenericEndpointContext,
	popupOrigin: string,
	message: Omit<OAuthPopupData, "type" | "targetOrigin">,
): Response {
	if (message.token && !warnedMissingBearer && !c.context.hasPlugin("bearer")) {
		warnedMissingBearer = true;
		c.context.logger.warn(
			"OAuth popup hands the session token back via postMessage, but the `bearer` plugin is not registered, so an embedded (cross-site iframe) app cannot authenticate with it. Add bearer() to your auth `plugins`.",
		);
	}

	const data: OAuthPopupData = {
		type: OAUTH_POPUP_MESSAGE_TYPE,
		targetOrigin: popupOrigin,
		...message,
	};

	const html = `<!doctype html>
<html>
<head><meta charset="utf-8"><title>Completing sign-in</title></head>
<body>
<script type="application/json" id="${OAUTH_POPUP_DATA_ELEMENT_ID}">${inlineJSON(data)}</script>
<script>${OAUTH_POPUP_COMPLETE_SCRIPT}</script>
</body>
</html>`;

	return new Response(html, {
		status: 200,
		headers: {
			"content-type": "text/html; charset=utf-8",
			"content-security-policy": `default-src 'none'; script-src '${OAUTH_POPUP_SCRIPT_CSP_HASH}'; base-uri 'none'`,
			"cache-control": "no-store", // The page carries the session token, so keep it out of any cache
			pragma: "no-cache",
		},
	});
}

/**
 * Starts the OAuth flow for a popup. The popup navigates here (top-level, so it
 * is first-party to the auth origin even when the app is on another origin),
 * the server sets the state + opener-marker cookies in the right partition, then
 * redirects to the provider. The callback then renders the completion page.
 */
const oauthPopupStart = createAuthEndpoint(
	"/oauth-popup/start",
	{
		method: "GET",
		query: z.object({
			provider: z.string(),
			popupOrigin: z.string(),
			popupNonce: z.string().optional(),
			callbackURL: z.string().optional(),
			errorCallbackURL: z.string().optional(),
			newUserCallbackURL: z.string().optional(),
			scopes: z.string().optional(),
			requestSignUp: z.string().optional(),
			additionalData: z.string().optional(),
		}),
		metadata: HIDE_METADATA,
	},
	async (c) => {
		const { popupOrigin } = c.query;
		// The opener must be trusted before we postMessage anything to it; if not,
		// we can't safely relay, so reject hard.
		if (
			!c.context.isTrustedOrigin(popupOrigin, { allowRelativePaths: false })
		) {
			c.context.logger.error(
				`OAuth popup origin is not a trusted origin. Add ${popupOrigin} to trustedOrigins.`,
			);
			throw APIError.from("FORBIDDEN", BASE_ERROR_CODES.INVALID_ORIGIN);
		}

		// Once the opener is trusted, relay start-stage failures to it as a
		// completion error page (so it isn't left waiting for a timeout).
		const fail = (code: string, description?: string) =>
			renderCompletion(c, popupOrigin, {
				nonce: c.query.popupNonce ?? "",
				error: { code, description },
			});

		// `originCheckMiddleware` skips GET, so mirror its trusted-origin check on
		// the redirect URLs here, relaying the failure to the opener rather than
		// throwing.
		const validateRedirect = (url: string | undefined, code: string) => {
			if (
				!url ||
				c.context.isTrustedOrigin(url, { allowRelativePaths: true })
			) {
				return undefined;
			}
			c.context.logger.error(`Invalid redirect URL: ${url}`);
			return fail(code, `Untrusted URL: ${url}`);
		};
		const invalidRedirect =
			validateRedirect(c.query.callbackURL, "invalid_callback_url") ??
			validateRedirect(
				c.query.errorCallbackURL,
				"invalid_error_callback_url",
			) ??
			validateRedirect(
				c.query.newUserCallbackURL,
				"invalid_new_user_callback_url",
			);
		if (invalidRedirect) return invalidRedirect;

		// `getAwaitableValue(socialProviders, ...)` resolves built-in social and
		// generic-oauth providers alike (generic-oauth merges into socialProviders).
		const provider = await getAwaitableValue(c.context.socialProviders, {
			value: c.query.provider,
		});
		if (!provider) {
			return fail(
				"provider_not_found",
				`Unknown provider: ${c.query.provider}`,
			);
		}

		const callbackURL = c.query.callbackURL || c.context.baseURL;

		let url: URL;
		try {
			const codeVerifier = generateRandomString(128);
			const parsedAdditionalData = c.query.additionalData
				? (safeJSONParse<Record<string, unknown>>(c.query.additionalData) ?? {})
				: {};
			const additionalData = Object.fromEntries(
				Object.entries(parsedAdditionalData).filter(
					([key]) => !INTERNAL_STATE_KEYS.has(key),
				),
			);
			const stateData: StateData = {
				...additionalData,
				callbackURL,
				codeVerifier,
				errorURL: c.query.errorCallbackURL,
				newUserURL: c.query.newUserCallbackURL,
				requestSignUp: c.query.requestSignUp === "true" ? true : undefined,
				expiresAt: Date.now() + 10 * 60 * 1000,
			};
			await setOAuthState(stateData);
			const { state } = await generateGenericState(c, stateData);

			// Remember the opener so the callback's completion page can post to it.
			const marker = c.context.createAuthCookie(POPUP_MARKER_COOKIE, {
				maxAge: 10 * 60,
			});
			await c.setSignedCookie(
				marker.name,
				JSON.stringify({ popupOrigin, popupNonce: c.query.popupNonce ?? "" }),
				c.context.secret,
				marker.attributes,
			);

			url = await provider.createAuthorizationURL({
				state,
				codeVerifier,
				redirectURI: `${c.context.baseURL}/callback/${provider.id}`,
				scopes: c.query.scopes ? c.query.scopes.split(",") : undefined,
			});
		} catch (error) {
			c.context.logger.error("OAuth popup failed to start", error);
			return fail("popup_sign_in_failed", "Failed to start the OAuth flow.");
		}

		throw c.redirect(url.toString());
	},
);

/**
 * Server plugin for popup-based OAuth. `signIn.popup` navigates the popup to
 * `/oauth-popup/start`; on the OAuth callback this plugin swaps the redirect for
 * a page that posts the session token (or error) back to the opener. Pair with
 * the `bearer` plugin and `oauthPopupClient`.
 */
export const oauthPopup = () => {
	return {
		id: "oauth-popup",
		version: PACKAGE_VERSION,
		$ERROR_CODES: OAUTH_POPUP_ERROR_CODES,
		endpoints: { oauthPopupStart },
		hooks: {
			after: [
				{
					matcher(context) {
						return !!(
							context.path?.startsWith("/callback/") ||
							context.path?.startsWith("/oauth2/callback/")
						);
					},
					handler: createAuthMiddleware(async (c) => {
						const redirectTo = c.context.responseHeaders?.get("location");
						if (!redirectTo) return;

						const cookie = c.context.createAuthCookie(POPUP_MARKER_COOKIE);
						const marker = await c.getSignedCookie(
							cookie.name,
							c.context.secret,
						);
						if (!marker) return; // not a popup flow -> keep the redirect

						// clear the marker on the completion response.
						expireCookie(c, cookie);

						let popupOrigin: string;
						let popupNonce: string;
						try {
							const parsed = JSON.parse(marker) as {
								popupOrigin: string;
								popupNonce: string;
							};
							popupOrigin = parsed.popupOrigin;
							popupNonce = parsed.popupNonce ?? "";
						} catch {
							return;
						}

						// The session token is the cookie `setSessionCookie` just wrote;
						// post it back to the opener. No token -> the callback errored.
						const setCookies =
							c.context.responseHeaders?.getSetCookie?.() ??
							splitSetCookieHeader(
								c.context.responseHeaders?.get("set-cookie") ?? "",
							);
						let token: string | undefined;
						for (const raw of setCookies) {
							const value = parseSetCookieHeader(raw).get(
								c.context.authCookies.sessionToken.name,
							)?.value;
							if (value !== undefined) {
								token = value;
								break;
							}
						}

						let response: Response;
						if (token) {
							response = renderCompletion(c, popupOrigin, {
								nonce: popupNonce,
								token,
								redirectTo,
							});
						} else {
							const error = new URL(
								redirectTo,
								c.context.baseURL,
							).searchParams.get("error");
							if (!error) return; // unrecognized outcome -> keep the redirect
							response = renderCompletion(c, popupOrigin, {
								nonce: popupNonce,
								error: {
									code: error,
									description:
										new URL(redirectTo, c.context.baseURL).searchParams.get(
											"error_description",
										) ?? undefined,
								},
							});
						}

						// Swap the redirect for the completion page; the callback's
						// session cookies ride along on the response.
						c.context.returned = response;
					}),
				},
			],
		},
	} satisfies BetterAuthPlugin;
};

export {
	OAUTH_POPUP_DATA_ELEMENT_ID,
	OAUTH_POPUP_MESSAGE_TYPE,
	POPUP_MARKER_COOKIE,
} from "./constants";
export { OAUTH_POPUP_ERROR_CODES } from "./error-codes";
export type { OAuthPopupData, OAuthPopupMessage } from "./types";
