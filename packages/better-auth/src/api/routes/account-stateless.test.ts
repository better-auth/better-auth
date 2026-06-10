import { HttpResponse, http } from "msw";
import { setupServer } from "msw/node";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { betterAuth } from "../../auth/minimal";
import { genericOAuth } from "../../plugins/generic-oauth";

const IDP = "https://idp.stateless.test";
const SECRET = "stateless-test-secret-stateless-test-secret";

const server = setupServer(
	http.get(`${IDP}/.well-known/openid-configuration`, () =>
		HttpResponse.json({
			issuer: IDP,
			authorization_endpoint: `${IDP}/authorize`,
			token_endpoint: `${IDP}/token`,
			userinfo_endpoint: `${IDP}/userinfo`,
			jwks_uri: `${IDP}/jwks`,
		}),
	),
	http.post(`${IDP}/token`, () =>
		HttpResponse.json({
			token_type: "Bearer",
			access_token: "idp-access-token",
			refresh_token: "idp-refresh-token",
			expires_in: 3600,
			scope: "openid profile email",
		}),
	),
	http.get(`${IDP}/userinfo`, () =>
		HttpResponse.json({
			sub: "shared-idp-user",
			email: "user@stateless.test",
			name: "Stateless User",
		}),
	),
);

beforeAll(() => server.listen({ onUnhandledRequest: "bypass" }));
afterAll(() => server.close());

const makeStatelessAuth = () =>
	betterAuth({
		secret: SECRET,
		baseURL: "http://localhost:3000",
		trustedOrigins: ["http://localhost:3000"],
		// No database -> stateless: account and session live in cookies only.
		session: { cookieCache: { enabled: true, maxAge: 60 * 60 * 24 } },
		account: { storeStateStrategy: "cookie", storeAccountCookie: true },
		plugins: [
			genericOAuth({
				config: [
					{
						providerId: "idp",
						clientId: "client-id",
						clientSecret: "client-secret",
						scopes: ["openid", "profile", "email"],
						discoveryUrl: `${IDP}/.well-known/openid-configuration`,
						getUserInfo: async () => ({
							id: "shared-idp-user",
							email: "user@stateless.test",
							name: "Stateless User",
							emailVerified: true,
						}),
					},
				],
			}),
		],
	});

type Jar = Map<string, string>;

const collect = (res: Response, jar: Jar) => {
	for (const cookie of res.headers.getSetCookie()) {
		const [pair] = cookie.split(";");
		const idx = pair.indexOf("=");
		jar.set(pair.slice(0, idx), pair.slice(idx + 1));
	}
};

const cookieHeader = (jar: Jar) =>
	[...jar].map(([name, value]) => `${name}=${value}`).join("; ");

// Sign the shared IdP user in on a fresh stateless instance and return its cookie jar.
const signIn = async (auth: ReturnType<typeof makeStatelessAuth>) => {
	const jar: Jar = new Map();
	let res = await auth.handler(
		new Request("http://localhost:3000/api/auth/sign-in/oauth2", {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify({ providerId: "idp", callbackURL: "/" }),
		}),
	);
	collect(res, jar);
	const { url } = (await res.json()) as { url: string };
	const state = new URL(url).searchParams.get("state");
	res = await auth.handler(
		new Request(
			`http://localhost:3000/api/auth/oauth2/callback/idp?code=test-code&state=${state}`,
			{ headers: { cookie: cookieHeader(jar) }, redirect: "manual" },
		),
	);
	collect(res, jar);
	const session = (await auth.api.getSession({
		headers: new Headers({ cookie: cookieHeader(jar) }),
	})) as { user: { id: string } } | null;
	return { jar, userId: session?.user.id };
};

describe("stateless account resolution", () => {
	it("resolves a valid account cookie whose userId differs from the session user", async () => {
		// On serverless, separate stateless instances mint different ids for the same IdP user.
		const instanceA = makeStatelessAuth();
		const instanceB = makeStatelessAuth();
		const a = await signIn(instanceA);
		const b = await signIn(instanceB);

		expect(a.userId).toBeDefined();
		expect(b.userId).toBeDefined();
		expect(a.userId).not.toBe(b.userId);

		const accountCookieName = (await instanceA.$context).authCookies.accountData
			.name;

		// Browser keeps the session cookie from A but the account cookie was rewritten by B.
		const mixed: Jar = new Map(a.jar);
		for (const key of [...mixed.keys()]) {
			if (key.startsWith(accountCookieName)) mixed.delete(key);
		}
		for (const [key, value] of b.jar) {
			if (key.startsWith(accountCookieName)) mixed.set(key, value);
		}

		// A third instance (empty in-memory store, like a fresh serverless instance) has no
		// account to fall back to, so resolution depends entirely on the account cookie.
		const instanceC = makeStatelessAuth();
		const result = await instanceC.api.getAccessToken({
			body: { providerId: "idp", userId: a.userId },
			headers: new Headers({ cookie: cookieHeader(mixed) }),
		});

		expect(result.accessToken).toBe("idp-access-token");
	});
});
