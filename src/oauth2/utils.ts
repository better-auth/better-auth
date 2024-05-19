import type { OAuthProvider, OIDCProvider } from "../providers";
import type { CallbackContext } from "../routes/callback";
import type { SignInContext } from "../routes/signin";

export async function discoveryRequest(
	context: SignInContext | CallbackContext,
	provider: OAuthProvider | OIDCProvider,
): Promise<{
	authorization_endpoint?: string;
	token_endpoint?: string;
	userinfo_endpoint?: string;
}> {
	const issuerIdentifier = new URL(provider.issuer as string);
	if (!(issuerIdentifier instanceof URL)) {
		throw new TypeError('"issuerIdentifier" must be an instance of URL');
	}
	if (
		issuerIdentifier.protocol !== "https:" &&
		issuerIdentifier.protocol !== "http:"
	) {
		throw new TypeError('"issuer.protocol" must be "https:" or "http:"');
	}

	const url = new URL(issuerIdentifier.href);

	switch (provider.type) {
		case undefined:
		case "oidc":
			url.pathname = `${url.pathname}/.well-known/openid-configuration`.replace(
				"//",
				"/",
			);
			break;
		case "oauth":
			if (url.pathname === "/") {
				url.pathname = ".well-known/oauth-authorization-server";
			} else {
				url.pathname =
					`.well-known/oauth-authorization-server/${url.pathname}`.replace(
						"//",
						"/",
					);
			}
			break;
		default:
			throw new TypeError(`"provider.type" must be "oidc" or "oauth"`);
	}

	const headers = new Headers(context.request.headers);
	headers.set("accept", "application/json");

	return fetch(url.href, {
		headers: Object.fromEntries(headers.entries()),
		method: "GET",
		redirect: "manual",
	}).then((res) => {
		if (!res.ok) {
			throw new Error(`HTTP error! status: ${res.status}`);
		}
		return res.json();
	});
}
