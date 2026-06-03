import type {
	BetterAuthPlugin,
	GenericEndpointContext,
} from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import {
	expireCookie,
	parseSetCookieHeader,
	toCookieOptions,
} from "../../cookies";
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
 * Renders the page that posts the outcome (token or error) to the opener.
 * Returns `null` for an untrusted origin -> the caller keeps the redirect.
 */
function renderCompletion(
	c: GenericEndpointContext,
	popupOrigin: string,
	message: Omit<OAuthPopupData, "type" | "targetOrigin">,
): Response | null {
	if (!c.context.isTrustedOrigin(popupOrigin, { allowRelativePaths: false })) {
		c.context.logger.error(
			`OAuth popup origin is not a trusted origin. Add ${popupOrigin} to trustedOrigins.`,
		);
		return null;
	}

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
		},
	});
}

/**
 * Server plugin for popup-based OAuth. On sign-in it records the opener origin;
 * on the OAuth callback it replaces the redirect with a page that posts the
 * session token back. Pair with the `bearer` plugin and `oauthPopupClient`.
 */
export const oauthPopup = () => {
	return {
		id: "oauth-popup",
		version: PACKAGE_VERSION,
		$ERROR_CODES: OAUTH_POPUP_ERROR_CODES,
		hooks: {
			after: [
				{
					matcher(context) {
						return !!(
							context.path?.startsWith("/sign-in/social") ||
							context.path?.startsWith("/sign-in/oauth2")
						);
					},
					handler: createAuthMiddleware(async (c) => {
						const additionalData = c.body?.additionalData;
						const popupOrigin = additionalData?.popupOrigin;
						if (typeof popupOrigin !== "string" || !popupOrigin) {
							return;
						}
						const popupNonce =
							typeof additionalData?.popupNonce === "string"
								? additionalData.popupNonce
								: "";

						const cookie = c.context.createAuthCookie(POPUP_MARKER_COOKIE, {
							maxAge: 10 * 60,
						});
						await c.setSignedCookie(
							cookie.name,
							JSON.stringify({ popupOrigin, popupNonce }),
							c.context.secret,
							cookie.attributes,
						);
					}),
				},

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

						// On success the session token is the value `setSessionCookie`
						// just wrote (the same value the bearer plugin accepts); on
						// failure the callback redirects to the error URL with no token.
						const setCookie =
							c.context.responseHeaders?.get("set-cookie") ?? "";
						const token = parseSetCookieHeader(setCookie).get(
							c.context.authCookies.sessionToken.name,
						)?.value;

						let response: Response | null;
						if (token) {
							response = renderCompletion(c, popupOrigin, {
								nonce: popupNonce,
								token,
								redirectTo,
							});
							// `setSessionCookie` wrote the session cookies to the handler
							// response scope, which overriding the response would drop, so
							// re-set them on this hook's scope.
							for (const [name, attrs] of parseSetCookieHeader(setCookie)) {
								c.setCookie(name, attrs.value ?? "", toCookieOptions(attrs));
							}
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
						if (!response) return; // untrusted origin -> keep the redirect

						// replace the thrown redirect with the completion page.
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
