import { generateRandomString } from "better-auth/crypto";
import { jwt } from "better-auth/plugins/jwt";
import { getTestInstance } from "better-auth/test";
import { beforeAll, describe, expect, it } from "vitest";
import { oauthProviderClient } from "./client";
import { oauthProvider } from "./oauth";

const authServerBaseURL = "http://localhost:3000";
const registeredLocalhostRedirect = "http://localhost/callback?source=cli";
const registeredPortfulLocalhostRedirect =
	"http://localhost:8080/portful-callback";
const registeredIPv4Redirect = "http://127.0.0.1/callback";
type RedirectError = "invalid_redirect" | "invalid_request";

const rejectedRedirects = [
	{
		component: "path",
		redirectUri: "http://localhost:51234/other?source=cli",
		error: "invalid_redirect",
	},
	{
		component: "query",
		redirectUri: "http://localhost:51234/callback?source=other",
		error: "invalid_redirect",
	},
	{
		component: "protocol",
		redirectUri: "https://localhost:51234/callback?source=cli",
		error: "invalid_redirect",
	},
	{
		component: "localhost subdomain",
		redirectUri: "http://tenant.localhost:51234/callback?source=cli",
		error: "invalid_redirect",
	},
	{
		component: "fragment",
		redirectUri: "http://localhost:51234/callback?source=cli#fragment",
		error: "invalid_request",
	},
	{
		component: "empty fragment",
		redirectUri: "http://localhost:51234/callback?source=cli#",
		error: "invalid_request",
	},
	{
		component: "userinfo",
		redirectUri: "http://user:password@localhost:51234/callback?source=cli",
		error: "invalid_redirect",
	},
	{
		component: "scheme casing",
		redirectUri: "HTTP://localhost:51234/callback?source=cli",
		error: "invalid_redirect",
	},
	{
		component: "hostname casing",
		redirectUri: "http://LOCALHOST:51234/callback?source=cli",
		error: "invalid_redirect",
	},
	{
		component: "dot path segment",
		redirectUri: "http://localhost:51234/path/../callback?source=cli",
		error: "invalid_redirect",
	},
	{
		component: "empty query marker",
		redirectUri: "http://127.0.0.1:51234/callback?",
		error: "invalid_redirect",
	},
	{
		component: "IPv4 shorthand",
		redirectUri: "http://127.1:51234/callback",
		error: "invalid_redirect",
	},
] satisfies {
	component: string;
	redirectUri: string;
	error: RedirectError;
}[];

function expectAuthorizationCodeRedirect(
	location: URL,
	expectedRedirect: string,
) {
	const expectedURL = new URL(expectedRedirect);

	expect(location.origin).toBe(expectedURL.origin);
	expect(location.pathname).toBe(expectedURL.pathname);
	expect(location.searchParams.get("source")).toBe(
		expectedURL.searchParams.get("source"),
	);
	expect(location.searchParams.get("code")).toBeTypeOf("string");
	expect(location.searchParams.get("state")).toBe("state");
	expect(location.searchParams.has("error")).toBe(false);
}

function expectRejectedRedirect(location: URL, expectedError: RedirectError) {
	expect(location.origin).toBe(authServerBaseURL);
	expect(location.pathname).toBe("/api/auth/error");
	expect(location.searchParams.get("error")).toBe(expectedError);
	expect(location.searchParams.has("code")).toBe(false);
}

async function setupAuthorizationFixture() {
	const { auth, client, signInWithTestUser } = await getTestInstance(
		{
			baseURL: authServerBaseURL,
			plugins: [
				oauthProvider({
					loginPage: "/login",
					consentPage: "/consent",
				}),
				jwt(),
			],
		},
		{
			clientOptions: {
				plugins: [oauthProviderClient()],
			},
		},
	);
	const { headers } = await signInWithTestUser();
	const oauthClient = await auth.api.adminCreateOAuthClient({
		headers,
		body: {
			redirect_uris: [
				registeredLocalhostRedirect,
				registeredPortfulLocalhostRedirect,
				registeredIPv4Redirect,
			],
			application_type: "native",
			skip_consent: true,
		},
	});

	return async function authorizeRedirect(redirectUri: string) {
		const authorizationURL = new URL(
			`${authServerBaseURL}/api/auth/oauth2/authorize`,
		);
		authorizationURL.searchParams.set("client_id", oauthClient.client_id);
		authorizationURL.searchParams.set("redirect_uri", redirectUri);
		authorizationURL.searchParams.set("response_type", "code");
		authorizationURL.searchParams.set("scope", "openid");
		authorizationURL.searchParams.set("state", "state");
		authorizationURL.searchParams.set(
			"code_challenge",
			generateRandomString(43),
		);
		authorizationURL.searchParams.set("code_challenge_method", "S256");

		let redirectLocation: URL | undefined;
		await client.$fetch(authorizationURL.toString(), {
			headers,
			redirect: "manual",
			onResponse(context) {
				const location = context.response.headers.get("location");
				if (location) {
					redirectLocation = new URL(location, authServerBaseURL);
				}
			},
		});

		if (!redirectLocation) {
			throw new Error("Expected the authorize endpoint to redirect");
		}
		return redirectLocation;
	};
}

/**
 * @see https://github.com/better-auth/better-auth/issues/10937
 */
describe("oauth authorize loopback port variance", () => {
	let authorizeRedirect: Awaited<ReturnType<typeof setupAuthorizationFixture>>;

	beforeAll(async () => {
		authorizeRedirect = await setupAuthorizationFixture();
	});

	it("accepts an ephemeral port for localhost", async () => {
		const requestedRedirect = "http://localhost:51234/callback?source=cli";

		const location = await authorizeRedirect(requestedRedirect);

		expectAuthorizationCodeRedirect(location, requestedRedirect);
	});

	it("accepts a different port for a portful localhost registration", async () => {
		const requestedRedirect = "http://localhost:51234/portful-callback";

		const location = await authorizeRedirect(requestedRedirect);

		expectAuthorizationCodeRedirect(location, requestedRedirect);
	});

	it("preserves loopback IPv4 port variance", async () => {
		const requestedRedirect = "http://127.0.0.1:51234/callback";

		const location = await authorizeRedirect(requestedRedirect);

		expectAuthorizationCodeRedirect(location, requestedRedirect);
	});

	it.each(
		rejectedRedirects,
	)("rejects a changed $component", async (testCase) => {
		const location = await authorizeRedirect(testCase.redirectUri);

		expectRejectedRedirect(location, testCase.error);
	});
});
