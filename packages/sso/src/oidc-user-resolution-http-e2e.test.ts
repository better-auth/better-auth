import type { DBTransactionAdapter, User } from "better-auth";
import { getHttpTestInstance } from "better-auth/test";
import { OAuth2Server } from "oauth2-mock-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { sso } from ".";
import type { SSOOptions, SSOUserResolutionInput } from "./types";

type CookieJar = Map<string, string>;

type OIDCProfile = {
	subject: string;
	email: string;
	name: string;
};

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
	if (cookies?.size) headers.set("cookie", getCookieHeader(cookies));
	const response = await fetch(url, { ...init, headers });
	if (cookies) storeResponseCookies(response, cookies);
	return { response, body: (await response.json()) as T };
}

describe("SSO OIDC user resolution HTTP end-to-end", () => {
	const identityProvider = new OAuth2Server();
	let profile: OIDCProfile = {
		subject: "directory-user-1",
		email: "idp.employee@example.com",
		name: "Directory Employee",
	};

	beforeAll(async () => {
		await identityProvider.issuer.keys.generate("RS256");
		identityProvider.service.on("beforeUserinfo", (response) => {
			response.body = {
				sub: profile.subject,
				email: profile.email,
				name: profile.name,
				email_verified: true,
			};
			response.statusCode = 200;
		});
		identityProvider.service.on("beforeTokenSigning", (token) => {
			token.payload.sub = profile.subject;
			token.payload.email = profile.email;
			token.payload.name = profile.name;
			token.payload.email_verified = true;
		});
		await identityProvider.start(undefined, "127.0.0.1");
	});

	afterAll(async () => {
		await identityProvider.stop();
	});

	async function createInstance(
		options: Omit<SSOOptions, "defaultSSO">,
		registerCleanup: (cleanup: () => Promise<void>) => void,
		defaultSSO: NonNullable<SSOOptions["defaultSSO"]> = [
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
	) {
		const instance = await getHttpTestInstance(
			{
				emailAndPassword: { enabled: true },
				trustedOrigins: [identityProvider.issuer.url!],
				plugins: [
					sso({
						...options,
						defaultSSO,
					}),
				],
			},
			{ disableTestUser: true, testWith: "sqlite" },
		);
		registerCleanup(() => instance.server.close());
		return instance;
	}

	async function createPasswordUser(
		baseURL: string,
		email: string,
		cookies?: CookieJar,
	): Promise<{ id: string; email: string }> {
		const signUp = await fetchJSON<{ user: { id: string; email: string } }>(
			`${baseURL}/api/auth/sign-up/email`,
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: baseURL,
				},
				body: JSON.stringify({
					email,
					password: "employee-password",
					name: "Provisioned Employee",
				}),
			},
			cookies,
		);
		expect(signUp.response.status).toBe(200);
		return signUp.body.user;
	}

	async function completeSignIn(
		baseURL: string,
		providerId = "workforce",
	): Promise<{
		callback: Response;
		cookies: CookieJar;
	}> {
		const cookies: CookieJar = new Map();
		const signIn = await fetchJSON<{ url: string }>(
			`${baseURL}/api/auth/sign-in/sso`,
			{
				method: "POST",
				headers: {
					"content-type": "application/json",
					origin: baseURL,
				},
				body: JSON.stringify({
					providerId,
					callbackURL: `${baseURL}/employee`,
				}),
			},
			cookies,
		);
		expect(signIn.response.status).toBe(200);

		const authorization = await fetch(signIn.body.url, { redirect: "manual" });
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
	}

	it("links a bare provisioned user and resolves returning sign-ins again", async ({
		onTestFinished,
	}) => {
		profile = {
			subject: "directory-user-1",
			email: "idp.employee@example.com",
			name: "Directory Employee",
		};
		let provisionedUserId = "";
		const resolverInputs: SSOUserResolutionInput[] = [];
		const resolverDatabases: DBTransactionAdapter[] = [];
		const instance = await createInstance(
			{
				disableImplicitSignUp: true,
				resolveUser: async (input, context) => {
					resolverInputs.push(input);
					resolverDatabases.push(context.database);
					const user = await context.database.findOne<{ id: string }>({
						model: "user",
						where: [{ field: "id", value: provisionedUserId }],
					});
					return user
						? { action: "link", userId: user.id, profile: "preserve" }
						: { action: "reject", code: "SCIM_USER_NOT_PROVISIONED" };
				},
			},
			onTestFinished,
		);
		// This stack isolates SSO resolution. The SCIM stack replaces this direct
		// adapter seed with provisioning through the SCIM HTTP API.
		const context = await instance.auth.$context;
		const provisionedUser = await context.adapter.create<User>({
			model: "user",
			data: {
				email: "provisioned.employee@example.com",
				emailVerified: true,
				name: "Provisioned Employee",
				image: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});
		provisionedUserId = provisionedUser.id;
		expect(
			await instance.db.findMany({ model: "identity", where: [] }),
		).toHaveLength(0);
		expect(
			await instance.db.findMany({ model: "account", where: [] }),
		).toHaveLength(0);

		const firstSignIn = await completeSignIn(instance.baseURL);
		expect(firstSignIn.callback.headers.get("location")).toBe(
			`${instance.baseURL}/employee`,
		);
		const firstSession = await fetchJSON<{
			user: { id: string; email: string; name: string };
		}>(
			`${instance.baseURL}/api/auth/get-session`,
			{ method: "GET" },
			firstSignIn.cookies,
		);
		expect(firstSession.response.status).toBe(200);
		expect(firstSession.body.user).toMatchObject({
			id: provisionedUser.id,
			email: provisionedUser.email,
			name: provisionedUser.name,
		});

		const returningSignIn = await completeSignIn(instance.baseURL);
		expect(returningSignIn.callback.headers.get("location")).toBe(
			`${instance.baseURL}/employee`,
		);
		expect(resolverInputs).toHaveLength(2);
		expect(resolverInputs[0]).toMatchObject({
			protocol: "oidc",
			providerId: "workforce",
			providerInstanceId: "sso:config:workforce",
			identity: {
				issuer: identityProvider.issuer.url,
				providerAccountId: profile.subject,
			},
			providerUser: {
				email: profile.email,
				name: profile.name,
			},
			providerClaims: {
				sub: profile.subject,
				email: profile.email,
			},
		});
		expect(resolverInputs[0]?.providerUser).not.toHaveProperty("id");
		expect(resolverDatabases).toHaveLength(2);
		expect(
			await instance.db.findMany({ model: "user", where: [] }),
		).toHaveLength(1);
		const identities = await instance.db.findMany<{
			id: string;
			userId: string;
		}>({
			model: "identity",
			where: [{ field: "issuer", value: identityProvider.issuer.url! }],
		});
		expect(identities).toHaveLength(1);
		expect(identities[0]?.userId).toBe(provisionedUser.id);
		const accounts = await instance.db.findMany<{
			identityId: string;
			providerInstanceId: string;
		}>({
			model: "account",
			where: [
				{
					field: "providerInstanceId",
					value: "sso:config:workforce",
				},
			],
		});
		expect(accounts).toHaveLength(1);
		expect(accounts[0]?.identityId).toBe(identities[0]?.id);
	});

	it("uses default resolution for standard OIDC sign-up and authentication", async ({
		onTestFinished,
	}) => {
		profile = {
			subject: "default-resolution-user",
			email: "default.resolution@example.com",
			name: "Default Resolution Employee",
		};
		let resolverCallCount = 0;
		const instance = await createInstance(
			{
				resolveUser: () => {
					resolverCallCount += 1;
					return { action: "default" };
				},
			},
			onTestFinished,
		);

		const signIn = await completeSignIn(instance.baseURL);
		expect(signIn.callback.headers.get("location")).toBe(
			`${instance.baseURL}/employee`,
		);
		const session = await fetchJSON<{
			user: { id: string; email: string; name: string };
		}>(
			`${instance.baseURL}/api/auth/get-session`,
			{ method: "GET" },
			signIn.cookies,
		);
		expect(session.response.status).toBe(200);
		expect(session.body.user).toMatchObject({
			email: profile.email,
			name: profile.name,
		});
		expect(resolverCallCount).toBe(1);
		expect(
			await instance.db.findMany({ model: "user", where: [] }),
		).toHaveLength(1);
		expect(
			await instance.db.findMany({
				model: "identity",
				where: [{ field: "userId", value: session.body.user.id }],
			}),
		).toHaveLength(1);
		expect(
			await instance.db.findMany({
				model: "session",
				where: [{ field: "userId", value: session.body.user.id }],
			}),
		).toHaveLength(1);
	});

	it("resolves a dynamically registered OIDC provider through HTTP", async ({
		onTestFinished,
	}) => {
		profile = {
			subject: "persisted-provider-user",
			email: "persisted.provider@example.com",
			name: "Persisted Provider Employee",
		};
		const resolverInputs: SSOUserResolutionInput[] = [];
		const instance = await createInstance(
			{
				resolveUser: (input) => {
					resolverInputs.push(input);
					return { action: "default" };
				},
			},
			onTestFinished,
			[],
		);
		const adminCookies: CookieJar = new Map();
		const administrator = await createPasswordUser(
			instance.baseURL,
			"directory.administrator@example.com",
			adminCookies,
		);
		const providerId = "persisted-workforce";
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
					domain: "persisted.example.com",
					providerId,
					oidcConfig: {
						clientId: "persisted-workforce-client",
						clientSecret: "persisted-workforce-secret",
						pkce: false,
						discoveryEndpoint: `${identityProvider.issuer.url}/.well-known/openid-configuration`,
					},
				}),
			},
			adminCookies,
		);
		expect(registration.response.status).toBe(200);
		expect(registration.body.providerId).toBe(providerId);
		const provider = await instance.db.findOne<{ id: string }>({
			model: "ssoProvider",
			where: [{ field: "providerId", value: providerId }],
		});
		if (!provider)
			throw new Error("Registered OIDC provider was not persisted");

		const signIn = await completeSignIn(instance.baseURL, providerId);
		expect(signIn.callback.headers.get("location")).toBe(
			`${instance.baseURL}/employee`,
		);
		const session = await fetchJSON<{
			user: { id: string; email: string; name: string };
		}>(
			`${instance.baseURL}/api/auth/get-session`,
			{ method: "GET" },
			signIn.cookies,
		);
		expect(session.response.status).toBe(200);
		expect(session.body.user).toMatchObject({
			email: profile.email,
			name: profile.name,
		});
		expect(session.body.user.id).not.toBe(administrator.id);
		expect(resolverInputs).toHaveLength(1);
		const providerInstanceId = `sso:provider:${provider.id}`;
		expect(resolverInputs[0]).toMatchObject({
			protocol: "oidc",
			providerId,
			providerInstanceId,
			identity: {
				issuer: `${providerInstanceId}:oidc`,
				providerAccountId: profile.subject,
			},
		});
		expect(
			await instance.db.findMany({
				model: "account",
				where: [
					{
						field: "providerInstanceId",
						value: providerInstanceId,
					},
				],
			}),
		).toHaveLength(1);
	});

	it("rejects an unprovisioned same-email user without implicit fallback", async ({
		onTestFinished,
	}) => {
		profile = {
			subject: "unprovisioned-directory-user",
			email: "unprovisioned.employee@example.com",
			name: "Unprovisioned Employee",
		};
		let sameEmailUserId = "";
		const instance = await createInstance(
			{
				resolveUser: async (_input, context) => {
					await context.database.update({
						model: "user",
						where: [{ field: "id", value: sameEmailUserId }],
						update: { name: "This update must roll back" },
					});
					return {
						action: "reject",
						code: "SCIM_USER_NOT_PROVISIONED",
						message: "This directory user is not provisioned",
					};
				},
			},
			onTestFinished,
		);
		const sameEmailUser = await createPasswordUser(
			instance.baseURL,
			profile.email,
		);
		sameEmailUserId = sameEmailUser.id;
		const recordCountsBefore = {
			users: await instance.db.count({ model: "user", where: [] }),
			identities: await instance.db.count({ model: "identity", where: [] }),
			accounts: await instance.db.count({ model: "account", where: [] }),
			sessions: await instance.db.count({ model: "session", where: [] }),
		};

		const signIn = await completeSignIn(instance.baseURL);
		expect(signIn.callback.status).toBe(302);
		const errorRedirect = new URL(
			signIn.callback.headers.get("location")!,
			instance.baseURL,
		);
		expect(errorRedirect.searchParams.get("error")).toBe(
			"SCIM_USER_NOT_PROVISIONED",
		);
		expect(errorRedirect.searchParams.get("error_description")).toBe(
			"This directory user is not provisioned",
		);
		expect(
			await fetchJSON<{ user: { id: string } } | null>(
				`${instance.baseURL}/api/auth/get-session`,
				{ method: "GET" },
				signIn.cookies,
			),
		).toMatchObject({ body: null });
		expect({
			users: await instance.db.count({ model: "user", where: [] }),
			identities: await instance.db.count({ model: "identity", where: [] }),
			accounts: await instance.db.count({ model: "account", where: [] }),
			sessions: await instance.db.count({ model: "session", where: [] }),
		}).toEqual(recordCountsBefore);
		expect(
			await instance.db.findOne<{ name: string }>({
				model: "user",
				where: [{ field: "id", value: sameEmailUser.id }],
			}),
		).toMatchObject({ name: "Provisioned Employee" });
	});

	it("rolls back resolver writes when authentication returns a failure", async ({
		onTestFinished,
	}) => {
		profile = {
			subject: "signup-disabled-directory-user",
			email: "signup.disabled@example.com",
			name: "Signup Disabled Employee",
		};
		let existingUserId = "";
		const instance = await createInstance(
			{
				disableImplicitSignUp: true,
				resolveUser: async (_input, context) => {
					await context.database.update({
						model: "user",
						where: [{ field: "id", value: existingUserId }],
						update: { name: "This resolver update must roll back" },
					});
					return { action: "default" };
				},
			},
			onTestFinished,
		);
		const existingUser = await createPasswordUser(
			instance.baseURL,
			"existing.employee@example.com",
		);
		existingUserId = existingUser.id;
		const recordCountsBefore = {
			users: await instance.db.count({ model: "user", where: [] }),
			identities: await instance.db.count({ model: "identity", where: [] }),
			accounts: await instance.db.count({ model: "account", where: [] }),
			sessions: await instance.db.count({ model: "session", where: [] }),
		};

		const signIn = await completeSignIn(instance.baseURL);

		expect(signIn.callback.status).toBe(302);
		const errorRedirect = new URL(
			signIn.callback.headers.get("location")!,
			instance.baseURL,
		);
		expect(errorRedirect.searchParams.get("error")).toBe("signup disabled");
		expect({
			users: await instance.db.count({ model: "user", where: [] }),
			identities: await instance.db.count({ model: "identity", where: [] }),
			accounts: await instance.db.count({ model: "account", where: [] }),
			sessions: await instance.db.count({ model: "session", where: [] }),
		}).toEqual(recordCountsBefore);
		expect(
			await instance.db.findOne<{ name: string }>({
				model: "user",
				where: [{ field: "id", value: existingUser.id }],
			}),
		).toMatchObject({ name: "Provisioned Employee" });
	});

	it("rejects a resolver link that conflicts with an existing provider identity", async ({
		onTestFinished,
	}) => {
		profile = {
			subject: "conflicting-directory-user",
			email: "conflicting.employee@example.com",
			name: "Conflicting Employee",
		};
		let resolvedUserId = "";
		const instance = await createInstance(
			{
				disableImplicitSignUp: true,
				resolveUser: () => ({
					action: "link",
					userId: resolvedUserId,
					profile: "preserve",
				}),
			},
			onTestFinished,
		);
		const firstUser = await createPasswordUser(
			instance.baseURL,
			"first.employee@example.com",
		);
		const secondUser = await createPasswordUser(
			instance.baseURL,
			"second.employee@example.com",
		);
		resolvedUserId = firstUser.id;
		const firstSignIn = await completeSignIn(instance.baseURL);
		expect(firstSignIn.callback.headers.get("location")).toBe(
			`${instance.baseURL}/employee`,
		);
		const recordCountsAfterLink = {
			users: await instance.db.count({ model: "user", where: [] }),
			identities: await instance.db.count({ model: "identity", where: [] }),
			accounts: await instance.db.count({ model: "account", where: [] }),
			sessions: await instance.db.count({ model: "session", where: [] }),
		};

		resolvedUserId = secondUser.id;
		const conflictingSignIn = await completeSignIn(instance.baseURL);
		const errorRedirect = new URL(
			conflictingSignIn.callback.headers.get("location")!,
			instance.baseURL,
		);
		expect(errorRedirect.searchParams.get("error")).toBe(
			"identity_already_linked",
		);
		expect({
			users: await instance.db.count({ model: "user", where: [] }),
			identities: await instance.db.count({ model: "identity", where: [] }),
			accounts: await instance.db.count({ model: "account", where: [] }),
			sessions: await instance.db.count({ model: "session", where: [] }),
		}).toEqual(recordCountsAfterLink);
	});

	it("fails before invoking the resolver without native transactions", async ({
		onTestFinished,
	}) => {
		profile = {
			subject: "unsupported-adapter-user",
			email: "unsupported.employee@example.com",
			name: "Unsupported Adapter Employee",
		};
		let resolverCallCount = 0;
		const instance = await createInstance(
			{
				resolveUser: () => {
					resolverCallCount += 1;
					return { action: "default" };
				},
			},
			onTestFinished,
		);
		const context = await instance.auth.$context;
		if (!context.adapter.options) {
			throw new Error(
				"Test adapter did not expose its capability configuration",
			);
		}
		context.adapter.options.adapterConfig.transaction = false;

		const signIn = await completeSignIn(instance.baseURL);
		const errorRedirect = new URL(
			signIn.callback.headers.get("location")!,
			instance.baseURL,
		);
		expect(errorRedirect.searchParams.get("error")).toBe(
			"SSO_USER_RESOLUTION_REQUIRES_NATIVE_TRANSACTIONS",
		);
		expect(resolverCallCount).toBe(0);
		expect(
			await instance.db.findMany({ model: "identity", where: [] }),
		).toHaveLength(0);
		expect(
			await instance.db.findMany({ model: "account", where: [] }),
		).toHaveLength(0);
		expect(
			await instance.db.findMany({ model: "session", where: [] }),
		).toHaveLength(0);
	});

	it("normalizes thrown and malformed resolver failures", async ({
		onTestFinished,
	}) => {
		profile = {
			subject: "resolver-failure-user",
			email: "resolver.failure@example.com",
			name: "Resolver Failure Employee",
		};
		const thrownFailureInstance = await createInstance(
			{
				resolveUser: () => {
					throw new Error("private directory topology");
				},
			},
			onTestFinished,
		);
		const thrownFailure = await completeSignIn(thrownFailureInstance.baseURL);
		const thrownFailureRedirect = new URL(
			thrownFailure.callback.headers.get("location")!,
			thrownFailureInstance.baseURL,
		);
		expect(thrownFailureRedirect.searchParams.get("error")).toBe(
			"SSO_USER_RESOLUTION_FAILED",
		);
		expect(thrownFailureRedirect.searchParams.get("error_description")).toBe(
			"Unable to resolve the SSO user",
		);
		expect(thrownFailureRedirect.toString()).not.toContain(
			"directory+topology",
		);

		const malformedResolver = (() => null) as unknown as NonNullable<
			SSOOptions["resolveUser"]
		>;
		const malformedResultInstance = await createInstance(
			{ resolveUser: malformedResolver },
			onTestFinished,
		);
		const malformedResult = await completeSignIn(
			malformedResultInstance.baseURL,
		);
		const malformedResultRedirect = new URL(
			malformedResult.callback.headers.get("location")!,
			malformedResultInstance.baseURL,
		);
		expect(malformedResultRedirect.searchParams.get("error")).toBe(
			"SSO_USER_RESOLUTION_FAILED",
		);
		expect(malformedResultRedirect.searchParams.get("error_description")).toBe(
			"Unable to resolve the SSO user",
		);
		expect(
			await malformedResultInstance.db.findMany({
				model: "identity",
				where: [],
			}),
		).toHaveLength(0);
		expect(
			await malformedResultInstance.db.findMany({
				model: "account",
				where: [],
			}),
		).toHaveLength(0);
		expect(
			await malformedResultInstance.db.findMany({
				model: "session",
				where: [],
			}),
		).toHaveLength(0);
	});
});
