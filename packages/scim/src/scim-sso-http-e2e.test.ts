import { sso } from "@better-auth/sso";
import { getHttpTestInstance } from "better-auth/test";
import { OAuth2Server } from "oauth2-mock-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { acquireActiveSCIMUserLink, scim } from ".";

const SCIM_USER_SCHEMA = "urn:ietf:params:scim:schemas:core:2.0:User";
const SCIM_PATCH_SCHEMA = "urn:ietf:params:scim:api:messages:2.0:PatchOp";
const SCIM_MEDIA_TYPE = "application/scim+json";
const WORKFORCE_CONNECTION_ID = "workforce";
const WORKFORCE_TOKEN = "workforce-scim-token";
const CONTRACTOR_CONNECTION_ID = "contractors";
const CONTRACTOR_TOKEN = "contractors-scim-token";

type CookieJar = Map<string, string>;

interface SCIMUserResponse {
	id: string;
	active: boolean;
}

interface SessionResponse {
	user: {
		id: string;
		email: string;
		name: string;
	};
}

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
		if (value) cookies.set(name, value);
		else cookies.delete(name);
	}
}

function getCookieHeader(cookies: CookieJar): string {
	return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function readJSON<T>(response: Response): Promise<T> {
	return (await response.json()) as T;
}

function createSCIMHeaders(token: string): HeadersInit {
	return {
		accept: SCIM_MEDIA_TYPE,
		authorization: `Bearer ${token}`,
		"content-type": SCIM_MEDIA_TYPE,
	};
}

describe("SCIM-provisioned SSO authentication over HTTP", () => {
	const identityProvider = new OAuth2Server();
	const externalId = "directory-user-1";

	beforeAll(async () => {
		await identityProvider.issuer.keys.generate("RS256");
		identityProvider.service.on("beforeUserinfo", (response) => {
			response.body = {
				sub: externalId,
				email: "employee@identity-provider.example",
				name: "Identity Provider Employee",
				email_verified: true,
			};
			response.statusCode = 200;
		});
		identityProvider.service.on("beforeTokenSigning", (token) => {
			token.payload.sub = externalId;
			token.payload.email = "employee@identity-provider.example";
			token.payload.name = "Identity Provider Employee";
			token.payload.email_verified = true;
		});
		await identityProvider.start(undefined, "127.0.0.1");
	});

	afterAll(async () => {
		await identityProvider.stop();
	});

	it("authenticates only the active User owned by the configured SCIM connection", async ({
		onTestFinished,
	}) => {
		const instance = await getHttpTestInstance(
			{
				trustedOrigins: [identityProvider.issuer.url!],
				plugins: [
					scim({
						connections: [
							{
								id: WORKFORCE_CONNECTION_ID,
								credentials: [
									{
										type: "bearer",
										id: "workforce-token",
										token: WORKFORCE_TOKEN,
									},
								],
							},
							{
								id: CONTRACTOR_CONNECTION_ID,
								credentials: [
									{
										type: "bearer",
										id: "contractors-token",
										token: CONTRACTOR_TOKEN,
									},
								],
							},
						],
					}),
					sso({
						disableImplicitSignUp: true,
						defaultSSO: [
							{
								domain: "example.com",
								providerId: "workforce",
								oidcConfig: {
									issuer: identityProvider.issuer.url!,
									clientId: "workforce-client",
									clientSecret: "workforce-secret",
									pkce: false,
									discoveryEndpoint: `${identityProvider.issuer.url}/.well-known/openid-configuration`,
								},
							},
						],
						resolveUser: async (input, context) => {
							const link = await acquireActiveSCIMUserLink(
								{
									connectionId: WORKFORCE_CONNECTION_ID,
									externalId: input.identity.providerAccountId,
								},
								context,
							);
							return link
								? {
										action: "link",
										userId: link.userId,
										profile: "preserve",
									}
								: {
										action: "reject",
										code: "SCIM_USER_NOT_ACTIVE",
										message: "This directory user is not active",
									};
						},
					}),
				],
			},
			{ disableTestUser: true, testWith: "sqlite" },
		);
		onTestFinished(() => instance.server.close());

		async function provisionSCIMUser(
			token: string,
			userName: string,
		): Promise<SCIMUserResponse> {
			const response = await fetch(
				`${instance.baseURL}/api/auth/scim/v2/Users`,
				{
					method: "POST",
					headers: createSCIMHeaders(token),
					body: JSON.stringify({
						schemas: [SCIM_USER_SCHEMA],
						externalId,
						userName,
						name: { formatted: "Provisioned Employee" },
						active: true,
					}),
				},
			);
			expect(response.status).toBe(201);
			return readJSON<SCIMUserResponse>(response);
		}

		async function setSCIMUserActive(
			userId: string,
			active: boolean,
		): Promise<void> {
			const response = await fetch(
				`${instance.baseURL}/api/auth/scim/v2/Users/${encodeURIComponent(userId)}`,
				{
					method: "PATCH",
					headers: createSCIMHeaders(WORKFORCE_TOKEN),
					body: JSON.stringify({
						schemas: [SCIM_PATCH_SCHEMA],
						Operations: [{ op: "replace", path: "active", value: active }],
					}),
				},
			);
			expect(response.status).toBe(204);
		}

		async function deleteSCIMUser(userId: string): Promise<void> {
			const response = await fetch(
				`${instance.baseURL}/api/auth/scim/v2/Users/${encodeURIComponent(userId)}`,
				{
					method: "DELETE",
					headers: createSCIMHeaders(WORKFORCE_TOKEN),
				},
			);
			expect(response.status).toBe(204);
		}

		async function signInWithSSO(): Promise<{
			callback: Response;
			cookies: CookieJar;
		}> {
			const cookies: CookieJar = new Map();
			const signInResponse = await fetch(
				`${instance.baseURL}/api/auth/sign-in/sso`,
				{
					method: "POST",
					headers: {
						"content-type": "application/json",
						origin: instance.baseURL,
					},
					body: JSON.stringify({
						providerId: "workforce",
						callbackURL: `${instance.baseURL}/employee`,
					}),
				},
			);
			storeResponseCookies(signInResponse, cookies);
			expect(signInResponse.status).toBe(200);
			const signIn = await readJSON<{ url: string }>(signInResponse);
			const authorization = await fetch(signIn.url, { redirect: "manual" });
			const callbackURL = authorization.headers.get("location");
			if (!callbackURL) {
				throw new Error("OIDC provider did not return a callback URL");
			}
			const callback = await fetch(callbackURL, {
				headers: { cookie: getCookieHeader(cookies) },
				redirect: "manual",
			});
			expect(callback.status).toBe(302);
			storeResponseCookies(callback, cookies);
			return { callback, cookies };
		}

		async function getSession(
			cookies: CookieJar,
		): Promise<SessionResponse | null> {
			const response = await fetch(`${instance.baseURL}/api/auth/get-session`, {
				headers: { cookie: getCookieHeader(cookies) },
			});
			expect(response.status).toBe(200);
			return readJSON<SessionResponse | null>(response);
		}

		async function expectRejectedSignIn(): Promise<void> {
			const authRecordsBefore = {
				users: await instance.db.count({ model: "user", where: [] }),
				accounts: await instance.db.count({ model: "account", where: [] }),
				identities: await instance.db.count({ model: "identity", where: [] }),
				sessions: await instance.db.count({ model: "session", where: [] }),
			};
			const signIn = await signInWithSSO();
			const errorLocation = signIn.callback.headers.get("location");
			if (!errorLocation) throw new Error("SSO rejection did not redirect");
			const errorRedirect = new URL(errorLocation, instance.baseURL);
			expect(errorRedirect.searchParams.get("error")).toBe(
				"SCIM_USER_NOT_ACTIVE",
			);
			expect(await getSession(signIn.cookies)).toBeNull();
			expect({
				users: await instance.db.count({ model: "user", where: [] }),
				accounts: await instance.db.count({ model: "account", where: [] }),
				identities: await instance.db.count({ model: "identity", where: [] }),
				sessions: await instance.db.count({ model: "session", where: [] }),
			}).toEqual(authRecordsBefore);
		}

		const provisioned = await provisionSCIMUser(
			WORKFORCE_TOKEN,
			"provisioned.employee@example.com",
		);
		expect(provisioned.active).toBe(true);
		expect(await instance.db.count({ model: "user", where: [] })).toBe(1);
		expect(await instance.db.count({ model: "identity", where: [] })).toBe(0);
		expect(await instance.db.count({ model: "account", where: [] })).toBe(0);

		const firstSignIn = await signInWithSSO();
		expect(firstSignIn.callback.headers.get("location")).toBe(
			`${instance.baseURL}/employee`,
		);
		const firstSession = await getSession(firstSignIn.cookies);
		expect(firstSession?.user).toMatchObject({
			email: "provisioned.employee@example.com",
			name: "Provisioned Employee",
		});
		if (!firstSession) throw new Error("SSO sign-in did not create a session");
		const provisionedUserId = firstSession.user.id;

		const repeatSignIn = await signInWithSSO();
		expect((await getSession(repeatSignIn.cookies))?.user.id).toBe(
			provisionedUserId,
		);
		expect(await instance.db.count({ model: "user", where: [] })).toBe(1);
		expect(await instance.db.count({ model: "identity", where: [] })).toBe(1);
		expect(await instance.db.count({ model: "account", where: [] })).toBe(1);

		await setSCIMUserActive(provisioned.id, false);
		await expectRejectedSignIn();

		await setSCIMUserActive(provisioned.id, true);
		const reactivatedSignIn = await signInWithSSO();
		expect((await getSession(reactivatedSignIn.cookies))?.user.id).toBe(
			provisionedUserId,
		);

		await deleteSCIMUser(provisioned.id);
		await expectRejectedSignIn();

		await provisionSCIMUser(
			CONTRACTOR_TOKEN,
			"contractor.employee@example.com",
		);
		expect(await instance.db.count({ model: "user", where: [] })).toBe(2);
		await expectRejectedSignIn();

		const reprovisioned = await provisionSCIMUser(
			WORKFORCE_TOKEN,
			"restored.employee@example.com",
		);
		expect(reprovisioned.id).not.toBe(provisioned.id);
		const restoredSignIn = await signInWithSSO();
		expect((await getSession(restoredSignIn.cookies))?.user).toMatchObject({
			id: provisionedUserId,
			email: "restored.employee@example.com",
			name: "Provisioned Employee",
		});
		expect(await instance.db.count({ model: "user", where: [] })).toBe(2);
		expect(await instance.db.count({ model: "identity", where: [] })).toBe(1);
		expect(await instance.db.count({ model: "account", where: [] })).toBe(1);
	});
});
