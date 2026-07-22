import { DatabaseSync } from "node:sqlite";
import { NodeSqliteDialect } from "@better-auth/kysely-adapter/node-sqlite-dialect";
import type { Account, DBTransactionAdapter, User } from "better-auth";
import { getHttpTestInstance } from "better-auth/test";
import { Kysely } from "kysely";
import { OAuth2Server } from "oauth2-mock-server";
import {
	afterAll,
	afterEach,
	beforeAll,
	describe,
	expect,
	it,
	vi,
} from "vitest";
import { getMigrations } from "../../better-auth/src/db/get-migration";
import { sso } from ".";
import type { SSOOptions, SSOUserResolutionInput } from "./types";

type CookieJar = Map<string, string>;

function storeResponseCookies(response: Response, cookies: CookieJar): void {
	for (const setCookie of response.headers.getSetCookie()) {
		const separatorIndex = setCookie.indexOf(";");
		const cookie =
			separatorIndex < 0 ? setCookie : setCookie.slice(0, separatorIndex);
		const separator = cookie.indexOf("=");
		if (separator < 1) continue;
		const name = cookie.slice(0, separator);
		const value = cookie.slice(separator + 1);
		if (value) cookies.set(name, value);
		else cookies.delete(name);
	}
}

function cookieHeader(cookies: CookieJar): string {
	return [...cookies].map(([name, value]) => `${name}=${value}`).join("; ");
}

async function fetchJSON<T>(
	url: string,
	init: RequestInit,
	cookies?: CookieJar,
): Promise<{ response: Response; body: T }> {
	const headers = new Headers(init.headers);
	if (cookies?.size) headers.set("cookie", cookieHeader(cookies));
	const response = await fetch(url, { ...init, headers });
	if (cookies) storeResponseCookies(response, cookies);
	return { response, body: (await response.json()) as T };
}

describe("SSO OIDC user resolution HTTP", () => {
	const identityProvider = new OAuth2Server();
	let subject = "directory-user-1";
	let email = "idp.employee@example.com";
	let userInfoSubject: string | undefined;
	let omitIdToken = false;
	let beforeTokenSigning: (() => void) | undefined;
	const deferredCleanups: Array<() => Promise<void>> = [];

	beforeAll(async () => {
		await identityProvider.issuer.keys.generate("RS256");
		identityProvider.service.on("beforeUserinfo", (response) => {
			response.body = {
				sub: userInfoSubject ?? subject,
				email,
				name: "Directory Employee",
				email_verified: true,
			};
			response.statusCode = 200;
		});
		identityProvider.service.on("beforeTokenSigning", (token) => {
			beforeTokenSigning?.();
			token.payload.sub = subject;
			token.payload.email = email;
			token.payload.name = "Directory Employee";
			token.payload.email_verified = true;
		});
		identityProvider.service.on("beforeResponse", (response) => {
			if (omitIdToken) response.body.id_token = undefined;
		});
		await identityProvider.start(undefined, "127.0.0.1");
	});

	afterAll(async () => {
		await identityProvider.stop();
	});

	afterEach(async () => {
		for (const cleanup of deferredCleanups.splice(0).reverse()) {
			await cleanup();
		}
		userInfoSubject = undefined;
		omitIdToken = false;
		beforeTokenSigning = undefined;
	});

	function provider(providerId = "workforce") {
		return {
			domain: "example.com",
			providerId,
			oidcConfig: {
				issuer: identityProvider.issuer.url!,
				clientId: "workforce-client",
				clientSecret: "workforce-secret",
				pkce: false,
				discoveryEndpoint: `${identityProvider.issuer.url}/.well-known/openid-configuration`,
			},
		} satisfies NonNullable<SSOOptions["defaultSSO"]>[number];
	}

	async function createInstance(
		options: Omit<SSOOptions, "defaultSSO">,
		registerCleanup: (cleanup: () => Promise<void>) => void,
		authOptions: Record<string, unknown> = {},
		providers = [provider()],
	) {
		const sqlite = new DatabaseSync(":memory:");
		const db = new Kysely({
			dialect: new NodeSqliteDialect({ database: sqlite }),
		});
		const instance = await getHttpTestInstance(
			{
				...authOptions,
				database: {
					db,
					type: "sqlite",
					transaction: true,
				},
				plugins: [sso({ ...options, defaultSSO: providers })],
				trustedOrigins: [identityProvider.issuer.url!],
			},
			{ disableTestUser: true, testWith: "sqlite" },
		);
		const migrations = await getMigrations(instance.auth.options);
		await migrations.runMigrations();
		registerCleanup(async () => {
			await db.destroy();
		});
		registerCleanup(() => instance.server.close());
		return Object.assign(instance, { sqlite });
	}

	async function completeSignIn(baseURL: string, providerId = "workforce") {
		const cookies: CookieJar = new Map();
		const signIn = await fetchJSON<{ url: string }>(
			`${baseURL}/api/auth/sign-in/sso`,
			{
				method: "POST",
				headers: { "content-type": "application/json", origin: baseURL },
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
			headers: { cookie: cookieHeader(cookies) },
			redirect: "manual",
		});
		storeResponseCookies(callback, cookies);
		return { callback, cookies };
	}

	it("links the exact selected user without email fallback and resolves returning sign-ins", async ({
		onTestFinished,
	}) => {
		subject = "directory-user-1";
		email = "distinct-provider@example.com";
		const firstProviderEmail = email;
		let selectedUserId = "";
		const inputs: SSOUserResolutionInput[] = [];
		const databases: DBTransactionAdapter[] = [];
		const validationActions: string[] = [];
		const instance = await createInstance(
			{
				disableImplicitSignUp: true,
				resolveUser(input, context) {
					inputs.push(input);
					databases.push(context.database);
					return {
						action: "link",
						userId: selectedUserId,
						profile: "preserve",
					};
				},
			},
			onTestFinished,
			{
				account: { storeAccountCookie: true },
				user: {
					validateUserInfo({ source }: { source: { action: string } }) {
						validationActions.push(source.action);
					},
				},
				databaseHooks: {
					account: {
						create: {
							after() {
								throw new Error("committed account after-hook failure");
							},
						},
					},
				},
			},
		);
		const context = await instance.auth.$context;
		const selectedUser = await context.adapter.create<User>({
			model: "user",
			data: {
				email: "provisioned@example.com",
				emailVerified: false,
				name: "Provisioned Employee",
				image: "https://directory.example/avatar.png",
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});
		selectedUserId = selectedUser.id;

		const first = await completeSignIn(instance.baseURL);
		expect(first.callback.headers.get("location")).toBe(
			`${instance.baseURL}/employee`,
		);
		expect(first.callback.headers.getSetCookie().join(";")).toContain(
			"account_data=",
		);
		expect(first.callback.headers.getSetCookie().join(";")).toContain(
			"session_token=",
		);
		email = "changed-by-provider@example.com";
		await completeSignIn(instance.baseURL);

		expect(inputs).toHaveLength(2);
		expect(inputs[0]).toMatchObject({
			protocol: "oidc",
			providerId: "workforce",
			accountKey: {
				issuer: identityProvider.issuer.url,
				providerAccountId: subject,
			},
			providerUser: { email: firstProviderEmail },
			providerClaims: { sub: subject },
		});
		expect(databases).toHaveLength(2);
		expect(validationActions).toEqual(["link-account", "sign-in"]);
		const users = await instance.db.findMany<User>({
			model: "user",
			where: [],
		});
		expect(users).toHaveLength(1);
		expect(users[0]).toMatchObject({
			id: selectedUser.id,
			email: "provisioned@example.com",
			emailVerified: false,
			name: "Provisioned Employee",
			image: "https://directory.example/avatar.png",
		});
		const accounts = await instance.db.findMany<Account>({
			model: "account",
			where: [],
		});
		expect(accounts).toHaveLength(1);
		expect(accounts[0]).toMatchObject({
			issuer: identityProvider.issuer.url,
			providerAccountId: subject,
			providerId: "workforce",
			userId: selectedUser.id,
		});
	});

	it("preserves an unverified selected profile on a same-email first link", async ({
		onTestFinished,
	}) => {
		subject = "preserved-profile-user";
		email = "same-email@example.com";
		let selectedUserId = "";
		const instance = await createInstance(
			{
				resolveUser: () => ({
					action: "link",
					userId: selectedUserId,
					profile: "preserve",
				}),
			},
			onTestFinished,
		);
		const context = await instance.auth.$context;
		const selectedUser = await context.adapter.create<User>({
			model: "user",
			data: {
				email,
				emailVerified: false,
				name: "SCIM Name",
				image: "https://directory.example/scim.png",
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});
		selectedUserId = selectedUser.id;

		expect(
			(await completeSignIn(instance.baseURL)).callback.headers.get("location"),
		).toBe(`${instance.baseURL}/employee`);
		expect(
			await instance.db.findOne<User>({
				model: "user",
				where: [{ field: "id", value: selectedUser.id }],
			}),
		).toMatchObject({
			email,
			emailVerified: false,
			name: "SCIM Name",
			image: "https://directory.example/scim.png",
		});
	});

	it("updates an explicitly selected user from the provider profile", async ({
		onTestFinished,
	}) => {
		subject = "provider-profile-user";
		email = "provider-profile@example.com";
		let selectedUserId = "";
		const instance = await createInstance(
			{
				resolveUser: () => ({
					action: "link",
					userId: selectedUserId,
					profile: "update",
				}),
			},
			onTestFinished,
		);
		const context = await instance.auth.$context;
		const selected = await context.adapter.create<User>({
			model: "user",
			data: {
				email: "old-profile@example.com",
				emailVerified: false,
				name: "Old Profile",
				image: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});
		selectedUserId = selected.id;

		expect(
			(await completeSignIn(instance.baseURL)).callback.headers.get("location"),
		).toBe(`${instance.baseURL}/employee`);
		expect(
			await instance.db.findOne<User>({
				model: "user",
				where: [{ field: "id", value: selected.id }],
			}),
		).toMatchObject({
			email,
			emailVerified: false,
			name: "Directory Employee",
		});
	});

	it("rejects missing selected users and account ownership conflicts", async ({
		onTestFinished,
	}) => {
		subject = "selected-user-conflict";
		email = "selected-user-conflict@example.com";
		let selectedUserId = "missing-user";
		const instance = await createInstance(
			{
				resolveUser: () => ({
					action: "link",
					userId: selectedUserId,
					profile: "preserve",
				}),
			},
			onTestFinished,
		);

		const missing = await completeSignIn(instance.baseURL);
		expect(
			new URL(
				missing.callback.headers.get("location")!,
				instance.baseURL,
			).searchParams.get("error"),
		).toBe("user_not_found");

		const context = await instance.auth.$context;
		const owner = await context.adapter.create<User>({
			model: "user",
			data: {
				email: "owner@example.com",
				emailVerified: true,
				name: "Owner",
				image: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});
		const selected = await context.adapter.create<User>({
			model: "user",
			data: {
				email: "selected@example.com",
				emailVerified: true,
				name: "Selected",
				image: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});
		await context.internalAdapter.createAccount({
			issuer: identityProvider.issuer.url!,
			providerAccountId: subject,
			providerId: "workforce",
			userId: owner.id,
		});
		selectedUserId = selected.id;

		const conflict = await completeSignIn(instance.baseURL);
		expect(
			new URL(
				conflict.callback.headers.get("location")!,
				instance.baseURL,
			).searchParams.get("error"),
		).toBe("account_ownership_conflict");
		expect(await instance.db.count({ model: "session", where: [] })).toBe(0);

		instance.sqlite.exec("PRAGMA foreign_keys = OFF");
		instance.sqlite.prepare('DELETE FROM "user" WHERE "id" = ?').run(owner.id);
		instance.sqlite.exec("PRAGMA foreign_keys = ON");
		const orphaned = await completeSignIn(instance.baseURL);
		expect(
			new URL(
				orphaned.callback.headers.get("location")!,
				instance.baseURL,
			).searchParams.get("error"),
		).toBe("unable to link account");
		expect(await instance.db.count({ model: "session", where: [] })).toBe(0);
	});

	it("rolls back resolver and authentication writes without publishing cookies", async ({
		onTestFinished,
	}) => {
		subject = "rollback-user";
		email = "rollback@example.com";
		let markerUserId = "";
		const instance = await createInstance(
			{
				resolveUser: async (_input, context) => {
					await context.database.update({
						model: "user",
						where: [{ field: "id", value: markerUserId }],
						update: { name: "must roll back" },
					});
					return { action: "continue" };
				},
			},
			onTestFinished,
			{
				account: { storeAccountCookie: true },
				databaseHooks: {
					session: { create: { before: () => false } },
				},
			},
		);
		const context = await instance.auth.$context;
		const marker = await context.adapter.create<User>({
			model: "user",
			data: {
				email: "marker@example.com",
				emailVerified: true,
				name: "marker",
				image: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});
		markerUserId = marker.id;

		const signIn = await completeSignIn(instance.baseURL);
		const redirect = new URL(
			signIn.callback.headers.get("location")!,
			instance.baseURL,
		);
		expect(redirect.searchParams.get("error")).toBe("unable to create session");
		expect(signIn.callback.headers.getSetCookie().join(";")).not.toContain(
			"account_data=",
		);
		expect(signIn.callback.headers.getSetCookie().join(";")).not.toContain(
			"session_token=",
		);
		expect(await instance.db.count({ model: "account", where: [] })).toBe(0);
		expect(await instance.db.count({ model: "session", where: [] })).toBe(0);
		expect(
			await instance.db.findOne<User>({
				model: "user",
				where: [{ field: "id", value: marker.id }],
			}),
		).toMatchObject({ name: "marker" });
	});

	it("rejects another provider alias for an existing subject even on default resolution", async ({
		onTestFinished,
	}) => {
		subject = "provider-conflict-user";
		email = "provider-conflict@example.com";
		const instance = await createInstance(
			{ resolveUser: () => ({ action: "continue" }) },
			onTestFinished,
			{},
			[provider("workforce"), provider("another-workforce")],
		);
		expect(
			(await completeSignIn(instance.baseURL)).callback.headers.get("location"),
		).toBe(`${instance.baseURL}/employee`);
		const conflict = await completeSignIn(
			instance.baseURL,
			"another-workforce",
		);
		const redirect = new URL(
			conflict.callback.headers.get("location")!,
			instance.baseURL,
		);
		expect(redirect.searchParams.get("error")).toBe(
			"account_provider_conflict",
		);
		expect(await instance.db.count({ model: "account", where: [] })).toBe(1);
	});

	it("keeps case-distinct OIDC subjects as different account keys", async ({
		onTestFinished,
	}) => {
		subject = "CaseSensitiveSubject";
		email = "case-sensitive@example.com";
		const instance = await createInstance(
			{ resolveUser: () => ({ action: "continue" }) },
			onTestFinished,
		);

		expect(
			(await completeSignIn(instance.baseURL)).callback.headers.get("location"),
		).toBe(`${instance.baseURL}/employee`);
		subject = "casesensitivesubject";
		email = "case-sensitive-lower@example.com";
		expect(
			(await completeSignIn(instance.baseURL)).callback.headers.get("location"),
		).toBe(`${instance.baseURL}/employee`);

		const accounts = await instance.db.findMany<Account>({
			model: "account",
			where: [],
		});
		expect(
			accounts.map(({ providerAccountId }) => providerAccountId).sort(),
		).toEqual(["CaseSensitiveSubject", "casesensitivesubject"].sort());
	});

	it("rejects a persisted provider replacement between token exchange and finalization", async ({
		onTestFinished,
	}) => {
		subject = "provider-replacement-user";
		email = "provider-replacement@example.com";
		let resolverCalls = 0;
		const instance = await createInstance(
			{
				resolveUser: () => {
					resolverCalls += 1;
					return { action: "continue" };
				},
			},
			onTestFinished,
			{},
			[],
		);
		const context = await instance.auth.$context;
		const owner = await context.adapter.create<User>({
			model: "user",
			data: {
				email: "provider-owner@example.com",
				emailVerified: true,
				name: "Provider Owner",
				image: null,
				createdAt: new Date(),
				updatedAt: new Date(),
			},
		});
		instance.sqlite
			.prepare('UPDATE "user" SET "id" = ? WHERE "id" = ?')
			.run("default", owner.id);
		await context.adapter.create({
			model: "ssoProvider",
			data: {
				issuer: identityProvider.issuer.url!,
				domain: "example.com",
				oidcConfig: JSON.stringify(provider().oidcConfig),
				samlConfig: null,
				userId: "default",
				providerId: "workforce",
				organizationId: null,
			},
		});
		beforeTokenSigning = () => {
			instance.sqlite
				.prepare('UPDATE "ssoProvider" SET "id" = ? WHERE "providerId" = ?')
				.run("replacement-provider-row", "workforce");
		};

		const signIn = await completeSignIn(instance.baseURL);
		expect(
			new URL(
				signIn.callback.headers.get("location")!,
				instance.baseURL,
			).searchParams.get("error"),
		).toBe("SSO_PROVIDER_CHANGED");
		expect(resolverCalls).toBe(0);
		expect(await instance.db.count({ model: "account", where: [] })).toBe(0);
	});

	it("returns committed session cookies when secondary mirroring fails", async ({
		onTestFinished,
	}) => {
		subject = "secondary-storage-failure-user";
		email = "secondary-storage-failure@example.com";
		const secondaryValues = new Map<string, string>();
		const mirrorSet = vi.fn(async (key: string, value: string) => {
			if (key.startsWith("active-sessions-")) {
				throw new Error("secondary storage unavailable");
			}
			secondaryValues.set(key, value);
		});
		const instance = await createInstance(
			{ resolveUser: () => ({ action: "continue" }) },
			onTestFinished,
			{
				secondaryStorage: {
					get: async (key: string) => secondaryValues.get(key) ?? null,
					getAndDelete: async (key: string) => {
						const value = secondaryValues.get(key) ?? null;
						secondaryValues.delete(key);
						return value;
					},
					set: mirrorSet,
					increment: async (key: string) => {
						const value = Number(secondaryValues.get(key) ?? 0) + 1;
						secondaryValues.set(key, String(value));
						return value;
					},
					delete: async (key: string) => {
						secondaryValues.delete(key);
					},
				},
				session: { storeSessionInDatabase: true },
			},
		);

		const signIn = await completeSignIn(instance.baseURL);
		expect(signIn.callback.headers.get("location")).toBe(
			`${instance.baseURL}/employee`,
		);
		expect(signIn.callback.headers.getSetCookie().join(";")).toContain(
			"session_token=",
		);
		expect(await instance.db.count({ model: "session", where: [] })).toBe(1);
		expect(mirrorSet).toHaveBeenCalled();
	});

	it("rejects missing ID Tokens and UserInfo subject mismatches before resolution", async ({
		onTestFinished,
	}) => {
		subject = "verified-token-user";
		email = "verified-token@example.com";
		let resolverCalls = 0;
		const instance = await createInstance(
			{
				resolveUser: () => {
					resolverCalls += 1;
					return { action: "continue" };
				},
			},
			onTestFinished,
		);

		omitIdToken = true;
		const missingToken = await completeSignIn(instance.baseURL);
		expect(
			new URL(
				missingToken.callback.headers.get("location")!,
				instance.baseURL,
			).searchParams.get("error_description"),
		).toBe("id_token_required_for_user_resolution");
		omitIdToken = false;

		userInfoSubject = "different-userinfo-subject";
		const mismatch = await completeSignIn(instance.baseURL);
		expect(
			new URL(
				mismatch.callback.headers.get("location")!,
				instance.baseURL,
			).searchParams.get("error_description"),
		).toBe("id_token_userinfo_subject_mismatch");
		userInfoSubject = undefined;
		expect(resolverCalls).toBe(0);
	});

	it("fails before resolution when native transactions are unavailable", async ({
		onTestFinished,
	}) => {
		subject = "unsupported-transaction-user";
		email = "unsupported-transaction@example.com";
		let resolverCalls = 0;
		const instance = await createInstance(
			{
				resolveUser: () => {
					resolverCalls += 1;
					return { action: "continue" };
				},
			},
			onTestFinished,
		);
		const context = await instance.auth.$context;
		if (!context.adapter.options) throw new Error("Missing adapter options");
		context.adapter.options.adapterConfig.transaction = false;

		const signIn = await completeSignIn(instance.baseURL);
		expect(
			new URL(
				signIn.callback.headers.get("location")!,
				instance.baseURL,
			).searchParams.get("error"),
		).toBe("SSO_USER_RESOLUTION_REQUIRES_NATIVE_TRANSACTIONS");
		expect(resolverCalls).toBe(0);
	});

	it.each([
		["account", "account_hook_binding_conflict"],
		["session", "session_hook_user_conflict"],
	] as const)("rejects %s hook attempts to rewrite the selected binding", async (hookModel, expectedError) => {
		subject = `${hookModel}-hook-rewrite-user`;
		email = `${hookModel}-hook-rewrite@example.com`;
		let selectedUserId = "";
		let otherUserId = "";
		const databaseHooks =
			hookModel === "account"
				? {
						account: {
							create: {
								before: () => ({ data: { userId: otherUserId } }),
							},
						},
					}
				: {
						session: {
							create: {
								before: () => ({ data: { userId: otherUserId } }),
							},
						},
					};
		const instance = await createInstance(
			{
				resolveUser: () => ({
					action: "link",
					userId: selectedUserId,
					profile: "preserve",
				}),
			},
			(cleanup) => deferredCleanups.push(cleanup),
			{ databaseHooks },
		);
		const context = await instance.auth.$context;
		const createUser = (name: string, address: string) =>
			context.adapter.create<User>({
				model: "user",
				data: {
					email: address,
					emailVerified: true,
					name,
					image: null,
					createdAt: new Date(),
					updatedAt: new Date(),
				},
			});
		const selected = await createUser("selected-user", "selected@example.com");
		const other = await createUser("other-user", "other@example.com");
		selectedUserId = selected.id;
		otherUserId = other.id;

		const signIn = await completeSignIn(instance.baseURL);
		expect(
			new URL(
				signIn.callback.headers.get("location")!,
				instance.baseURL,
			).searchParams.get("error"),
		).toBe(expectedError);
		expect(await instance.db.count({ model: "account", where: [] })).toBe(0);
		expect(await instance.db.count({ model: "session", where: [] })).toBe(0);
	});
});
