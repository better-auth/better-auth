import { getHttpTestInstance } from "better-auth/test";
import { OAuth2Server } from "oauth2-mock-server";
import { describe, expect, it } from "vitest";
import { sso } from ".";

type CookieJar = Map<string, string>;

function storeResponseCookies(response: Response, cookies: CookieJar): void {
	for (const setCookie of response.headers.getSetCookie()) {
		const attributesIndex = setCookie.indexOf(";");
		const cookie = setCookie.slice(
			0,
			attributesIndex === -1 ? setCookie.length : attributesIndex,
		);
		const separatorIndex = cookie.indexOf("=");
		if (separatorIndex < 1) continue;
		const name = cookie.slice(0, separatorIndex);
		const value = cookie.slice(separatorIndex + 1);
		if (value) {
			cookies.set(name, value);
		} else {
			cookies.delete(name);
		}
	}
}

function getCookieHeader(cookies: CookieJar): string {
	return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function fetchJSON<T>(
	url: string,
	init: RequestInit,
	cookies?: CookieJar,
): Promise<{ response: Response; body: T }> {
	const headers = new Headers(init.headers);
	if (cookies?.size) {
		headers.set("cookie", getCookieHeader(cookies));
	}
	const response = await fetch(url, { ...init, headers });
	if (cookies) storeResponseCookies(response, cookies);
	return { response, body: (await response.json()) as T };
}

describe("SSO OIDC HTTP end-to-end", () => {
	it("fails before persisting a provider when native transactions are unavailable", async ({
		onTestFinished,
	}) => {
		const instance = await getHttpTestInstance(
			{
				emailAndPassword: { enabled: true },
				plugins: [sso()],
			},
			{ disableTestUser: true, testWith: "sqlite" },
		);
		onTestFinished(() => instance.server.close());

		const adminCookies: CookieJar = new Map();
		const signUp = await fetchJSON<{ user: { email: string } }>(
			`${instance.baseURL}/api/auth/sign-up/email`,
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: instance.baseURL,
				},
				body: JSON.stringify({
					email: "admin@example.com",
					password: "administrator-password",
					name: "Directory Administrator",
				}),
			},
			adminCookies,
		);
		expect(signUp.response.status).toBe(200);

		const context = await instance.auth.$context;
		if (!context.adapter.options) {
			throw new Error(
				"Test adapter did not expose its capability configuration",
			);
		}
		context.adapter.options.adapterConfig.transaction = false;
		const registration = await fetchJSON<{
			code: string;
			message: string;
		}>(
			`${instance.baseURL}/api/auth/sso/register`,
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: instance.baseURL,
				},
				body: JSON.stringify({
					issuer: "https://idp.example.com",
					domain: "example.com",
					providerId: "unsupported-persisted-provider",
					oidcConfig: {
						clientId: "test-client",
						clientSecret: "test-secret",
						discoveryEndpoint:
							"https://idp.example.com/.well-known/openid-configuration",
					},
				}),
			},
			adminCookies,
		);

		expect(registration.response.status).toBe(501);
		expect(registration.body).toMatchObject({
			code: "PERSISTED_SSO_REQUIRES_NATIVE_TRANSACTIONS",
		});
		expect(
			await instance.db.findMany({ model: "ssoProvider", where: [] }),
		).toHaveLength(0);
	});

	it("isolates provider aliases and rejects stale provider callbacks", async ({
		onTestFinished,
	}) => {
		const identityProvider = new OAuth2Server();
		let activeProfile = {
			email: "browser.employee@example.com",
			name: "Browser Employee",
		};
		await identityProvider.issuer.keys.generate("RS256");
		identityProvider.service.on("beforeUserinfo", (response) => {
			response.body = {
				sub: "employee-123",
				email: activeProfile.email,
				name: activeProfile.name,
				email_verified: true,
			};
			response.statusCode = 200;
		});
		identityProvider.service.on("beforeTokenSigning", (token) => {
			token.payload.sub = "employee-123";
			token.payload.email = activeProfile.email;
			token.payload.name = activeProfile.name;
			token.payload.email_verified = true;
		});
		await identityProvider.start(undefined, "127.0.0.1");

		const instance = await getHttpTestInstance(
			{
				emailAndPassword: { enabled: true },
				trustedOrigins: [identityProvider.issuer.url!],
				plugins: [sso()],
			},
			{ disableTestUser: true, testWith: "sqlite" },
		);
		onTestFinished(async () => {
			await instance.server.close();
			await identityProvider.stop();
		});

		const adminCookies: CookieJar = new Map();
		const signUp = await fetchJSON<{ user: { email: string } }>(
			`${instance.baseURL}/api/auth/sign-up/email`,
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: instance.baseURL,
				},
				body: JSON.stringify({
					email: "admin@example.com",
					password: "administrator-password",
					name: "Directory Administrator",
				}),
			},
			adminCookies,
		);
		expect(signUp.response.status).toBe(200);

		type RegisteredProvider = { id: string; providerId: string };
		const registerProvider = async (
			providerId: string,
		): Promise<RegisteredProvider> => {
			const registration = await fetchJSON<{ providerId: string }>(
				`${instance.baseURL}/api/auth/sso/register`,
				{
					method: "POST",
					headers: {
						"content-type": "application/json",
						origin: instance.baseURL,
					},
					body: JSON.stringify({
						issuer: identityProvider.issuer.url,
						domain: `${providerId}.example.com`,
						providerId,
						oidcConfig: {
							clientId: "test-client",
							clientSecret: "test-secret",
							discoveryEndpoint: `${identityProvider.issuer.url}/.well-known/openid-configuration`,
						},
					}),
				},
				adminCookies,
			);
			expect(registration.response.status).toBe(200);
			const providerRecord = await instance.db.findOne<{ id: string }>({
				model: "ssoProvider",
				where: [{ field: "providerId", value: providerId }],
			});
			if (!providerRecord) {
				throw new Error(
					`Registered SSO provider ${providerId} was not persisted`,
				);
			}
			return {
				id: providerRecord.id,
				providerId: registration.body.providerId,
			};
		};

		const browserProvider = await registerProvider("workforce-browser");
		const desktopProvider = await registerProvider("workforce-desktop");

		type StartedSignIn = { authorizationURL: string; cookies: CookieJar };
		const startSignIn = async (providerId: string): Promise<StartedSignIn> => {
			const cookies: CookieJar = new Map();
			const signIn = await fetchJSON<{ url: string }>(
				`${instance.baseURL}/api/auth/sign-in/sso`,
				{
					method: "POST",
					headers: {
						"content-type": "application/json",
						origin: instance.baseURL,
					},
					body: JSON.stringify({
						providerId,
						callbackURL: `${instance.baseURL}/employee`,
					}),
				},
				cookies,
			);
			expect(signIn.response.status).toBe(200);
			return { authorizationURL: signIn.body.url, cookies };
		};

		const completeSignIn = async (
			{ authorizationURL, cookies }: StartedSignIn,
			profile: { email: string; name: string },
		): Promise<{ callback: Response; cookies: CookieJar }> => {
			activeProfile = profile;
			const authorization = await fetch(authorizationURL, {
				redirect: "manual",
			});
			const callbackURL = authorization.headers.get("location");
			if (!callbackURL)
				throw new Error("OIDC provider did not return a callback");
			const callback = await fetch(callbackURL, {
				method: "GET",
				headers: { cookie: getCookieHeader(cookies) },
				redirect: "manual",
			});
			storeResponseCookies(callback, cookies);
			return { callback, cookies };
		};

		const browserProfile = {
			email: "browser.employee@example.com",
			name: "Browser Employee",
		};
		const desktopProfile = {
			email: "desktop.employee@example.com",
			name: "Desktop Employee",
		};
		const staleConfigurationSignIn = await startSignIn(
			browserProvider.providerId,
		);
		const configurationUpdate = await fetchJSON<{ providerId: string }>(
			`${instance.baseURL}/api/auth/sso/update-provider`,
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: instance.baseURL,
				},
				body: JSON.stringify({
					providerId: browserProvider.providerId,
					oidcConfig: {
						scopes: ["openid", "email", "profile", "groups"],
					},
				}),
			},
			adminCookies,
		);
		expect(configurationUpdate.response.status).toBe(200);
		expect(configurationUpdate.body.providerId).toBe(
			browserProvider.providerId,
		);

		const staleConfigurationCallback = await completeSignIn(
			staleConfigurationSignIn,
			browserProfile,
		);
		expect(staleConfigurationCallback.callback.status).toBe(302);
		const staleConfigurationRedirect = new URL(
			staleConfigurationCallback.callback.headers.get("location")!,
			instance.baseURL,
		);
		expect(staleConfigurationRedirect.searchParams.get("error")).toBe(
			"invalid_state",
		);
		expect(
			staleConfigurationRedirect.searchParams.get("error_description"),
		).toBe("sso_provider_changed_during_authentication");

		const browserSignIn = await completeSignIn(
			await startSignIn(browserProvider.providerId),
			browserProfile,
		);
		const desktopSignIn = await completeSignIn(
			await startSignIn(desktopProvider.providerId),
			desktopProfile,
		);
		expect(browserSignIn.callback.status).toBe(302);
		expect(desktopSignIn.callback.status).toBe(302);
		expect(browserSignIn.callback.headers.get("location")).toBe(
			`${instance.baseURL}/employee`,
		);
		expect(desktopSignIn.callback.headers.get("location")).toBe(
			`${instance.baseURL}/employee`,
		);

		type ListedAccount = {
			id: string;
			providerId: string;
			identity: {
				id: string;
				issuer: string;
				providerAccountId: string;
			};
		};
		const listSSOAccounts = async (
			cookies: CookieJar,
		): Promise<ListedAccount[]> => {
			const listedAccounts = await fetchJSON<ListedAccount[]>(
				`${instance.baseURL}/api/auth/list-accounts`,
				{ method: "GET" },
				cookies,
			);
			expect(listedAccounts.response.status).toBe(200);
			return listedAccounts.body.filter((account) =>
				[browserProvider.providerId, desktopProvider.providerId].includes(
					account.providerId,
				),
			);
		};

		const browserAccounts = await listSSOAccounts(browserSignIn.cookies);
		const desktopAccounts = await listSSOAccounts(desktopSignIn.cookies);
		const browserProviderInstanceId = `sso:provider:${browserProvider.id}`;
		const desktopProviderInstanceId = `sso:provider:${desktopProvider.id}`;
		expect(browserAccounts).toHaveLength(1);
		expect(desktopAccounts).toHaveLength(1);
		expect(browserAccounts[0]).not.toHaveProperty("providerInstanceId");
		expect(desktopAccounts[0]).not.toHaveProperty("providerInstanceId");
		expect(browserAccounts[0]).toMatchObject({
			providerId: browserProvider.providerId,
			identity: {
				issuer: `${browserProviderInstanceId}:oidc`,
				providerAccountId: "employee-123",
			},
		});
		expect(desktopAccounts[0]).toMatchObject({
			providerId: desktopProvider.providerId,
			identity: {
				issuer: `${desktopProviderInstanceId}:oidc`,
				providerAccountId: "employee-123",
			},
		});
		expect(browserAccounts[0]?.identity.id).not.toBe(
			desktopAccounts[0]?.identity.id,
		);

		type SessionPayload = { user: { id: string; email: string } };
		const browserSession = await fetchJSON<SessionPayload>(
			`${instance.baseURL}/api/auth/get-session`,
			{ method: "GET" },
			browserSignIn.cookies,
		);
		const desktopSession = await fetchJSON<SessionPayload>(
			`${instance.baseURL}/api/auth/get-session`,
			{ method: "GET" },
			desktopSignIn.cookies,
		);
		expect(browserSession.response.status).toBe(200);
		expect(desktopSession.response.status).toBe(200);
		expect(browserSession.body.user.email).toBe(browserProfile.email);
		expect(desktopSession.body.user.email).toBe(desktopProfile.email);
		expect(browserSession.body.user.id).not.toBe(desktopSession.body.user.id);

		const staleBrowserSignIn = await startSignIn(browserProvider.providerId);
		const deletion = await fetchJSON<{ success: boolean }>(
			`${instance.baseURL}/api/auth/sso/delete-provider`,
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: instance.baseURL,
				},
				body: JSON.stringify({ providerId: browserProvider.providerId }),
			},
			adminCookies,
		);
		expect(deletion.response.status).toBe(200);
		expect(deletion.body.success).toBe(true);
		const replacementBrowserProvider = await registerProvider(
			browserProvider.providerId,
		);
		expect(replacementBrowserProvider.id).not.toBe(browserProvider.id);

		const staleCallback = await completeSignIn(
			staleBrowserSignIn,
			browserProfile,
		);
		expect(staleCallback.callback.status).toBe(302);
		const staleRedirect = new URL(
			staleCallback.callback.headers.get("location")!,
			instance.baseURL,
		);
		expect(staleRedirect.searchParams.get("error")).toBe("invalid_state");
		expect(staleRedirect.searchParams.get("error_description")).toBe(
			"sso_provider_changed_during_authentication",
		);

		const remainingAccounts = await instance.db.findMany<{
			providerId: string;
			providerInstanceId: string;
		}>({ model: "account", where: [] });
		expect(
			remainingAccounts.some(
				(account) =>
					account.providerInstanceId === `sso:provider:${browserProvider.id}`,
			),
		).toBe(false);
		expect(
			remainingAccounts.some(
				(account) =>
					account.providerInstanceId === `sso:provider:${desktopProvider.id}`,
			),
		).toBe(true);
		expect(
			remainingAccounts.some(
				(account) =>
					account.providerInstanceId ===
					`sso:provider:${replacementBrowserProvider.id}`,
			),
		).toBe(false);
		expect(
			await instance.db.findMany({ model: "identity", where: [] }),
		).toHaveLength(3);

		const survivingBrowserSession = await fetchJSON<SessionPayload>(
			`${instance.baseURL}/api/auth/get-session`,
			{ method: "GET" },
			browserSignIn.cookies,
		);
		const survivingDesktopSession = await fetchJSON<SessionPayload>(
			`${instance.baseURL}/api/auth/get-session`,
			{ method: "GET" },
			desktopSignIn.cookies,
		);
		expect(survivingBrowserSession.response.status).toBe(200);
		expect(survivingDesktopSession.response.status).toBe(200);
		expect(survivingBrowserSession.body.user).toEqual(browserSession.body.user);
		expect(survivingDesktopSession.body.user).toEqual(desktopSession.body.user);
		expect(await listSSOAccounts(browserSignIn.cookies)).toHaveLength(0);
		expect(await listSSOAccounts(desktopSignIn.cookies)).toHaveLength(1);
	});
});
