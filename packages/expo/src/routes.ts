import type { GenericEndpointContext } from "@better-auth/core";
import type { OAuthProvider } from "@better-auth/core/oauth2";
import { getAuthStateVerificationIdentifier, HIDE_METADATA } from "better-auth";
import { APIError, createAuthEndpoint } from "better-auth/api";
import * as z from "zod";

/**
 * Verification key for the authorization origin an SSO sign-in issued with an
 * OAuth state.
 */
export const getIssuedOriginIdentifier = (state: string) =>
	`expo-authorization-origin:${state}`;

// An authorization origin depends only on provider configuration, so build it
// once per provider. Failures are not cached and keep failing closed.
const providerOrigins = new WeakMap<OAuthProvider, string>();

async function getProviderAuthorizationOrigin(
	ctx: GenericEndpointContext,
	provider: OAuthProvider,
) {
	const cached = providerOrigins.get(provider);
	if (cached) return cached;
	const providerURL = await (async () =>
		provider.createAuthorizationURL({
			state: "state",
			codeVerifier: "code-verifier",
			redirectURI: `${ctx.context.baseURL}/callback/${provider.id}`,
		}))().catch(() => null);
	if (!providerURL) return null;
	providerOrigins.set(provider, providerURL.origin);
	return providerURL.origin;
}

async function isProviderAuthorizationOrigin(
	ctx: GenericEndpointContext,
	url: URL,
) {
	// Every authorization request this server issues carries a state, and the
	// callback rejects one without it.
	const state = url.searchParams.get("state");
	if (!state) return false;
	const origins = await Promise.all(
		ctx.context.socialProviders.map((provider) =>
			getProviderAuthorizationOrigin(ctx, provider),
		),
	);
	if (origins.includes(url.origin)) return true;
	// SSO providers have no static endpoint, so accept the origin their
	// sign-in issued for this state.
	const issued = await ctx.context.internalAdapter.findVerificationValue(
		getIssuedOriginIdentifier(state),
	);
	if (!issued || new Date(issued.expiresAt) < new Date()) return false;
	return issued.value === url.origin;
}

export const expoAuthorizationProxy = createAuthEndpoint(
	"/expo-authorization-proxy",
	{
		method: "GET",
		query: z.object({
			authorizationURL: z.string(),
			oauthState: z.string().optional(),
		}),
		metadata: HIDE_METADATA,
	},
	async (ctx) => {
		const { authorizationURL } = ctx.query;

		// This endpoint sets an OAuth state cookie and redirects, so the target
		// must be an external provider authorization endpoint. Reject malformed
		// or non-https targets and any same-origin Better Auth URL: a same-origin
		// target would allow a state cookie to be planted and a
		// login-CSRF / session-fixation flow through the auth domain.
		// FIXME(next): bind the redirect to a server-generated, signed proxy
		// token so only the app that started the flow can use it.
		//
		// A fragment is never part of a valid OAuth authorization endpoint, and a
		// bare trailing "#" parses to an empty url.hash, so reject on the raw value.
		if (authorizationURL.includes("#")) {
			throw new APIError("BAD_REQUEST", {
				message: "Invalid authorizationURL",
			});
		}
		let url: URL;
		try {
			url = new URL(authorizationURL);
		} catch {
			throw new APIError("BAD_REQUEST", {
				message: "Invalid authorizationURL",
			});
		}
		if (
			url.protocol !== "https:" ||
			url.origin === new URL(ctx.context.baseURL).origin
		) {
			throw new APIError("BAD_REQUEST", {
				message: "Invalid authorizationURL",
			});
		}
		if (!(await isProviderAuthorizationOrigin(ctx, url))) {
			throw new APIError("BAD_REQUEST", {
				message: "Invalid authorizationURL",
			});
		}

		const { oauthState } = ctx.query;
		if (oauthState) {
			const oauthStateCookie = ctx.context.createAuthCookie("oauth_state", {
				maxAge: 10 * 60, // 10 minutes
			});
			ctx.setCookie(
				oauthStateCookie.name,
				oauthState,
				oauthStateCookie.attributes,
			);
			return ctx.redirect(authorizationURL);
		}

		const state = url.searchParams.get("state");
		if (!state) {
			throw new APIError("BAD_REQUEST", {
				message: "Unexpected error",
			});
		}
		// Only sign a state this server issued and still holds.
		const verification =
			await ctx.context.internalAdapter.findVerificationValue(
				getAuthStateVerificationIdentifier(state),
			);
		if (!verification || new Date(verification.expiresAt) < new Date()) {
			return ctx.redirect(authorizationURL);
		}
		const stateCookie = ctx.context.createAuthCookie("state", {
			maxAge: 5 * 60, // 5 minutes
		});
		await ctx.setSignedCookie(
			stateCookie.name,
			state,
			ctx.context.secret,
			stateCookie.attributes,
		);
		return ctx.redirect(ctx.query.authorizationURL);
	},
);
