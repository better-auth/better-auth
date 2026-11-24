import { describe, expect, it } from "vitest";
import { parseCookies, parseSetCookieHeader } from "../../cookies";
import { getTestInstance } from "../../test-utils/test-instance";
import { admin } from "../admin/admin";
import { adminClient } from "../admin/client";
import { multiSession } from ".";
import { multiSessionClient } from "./client";

/**
 * @see https://github.com/better-auth/better-auth/issues/11713
 */
describe("multi-session database fallback", () => {
	async function createDeviceSessions() {
		const store = new Map<string, string>();
		const { auth, client, cookieSetter, testUser } = await getTestInstance(
			{
				plugins: [multiSession()],
				session: { storeSessionInDatabase: true },
				secondaryStorage: {
					get: (key) => store.get(key) ?? null,
					set(key, value) {
						store.set(key, value);
					},
					getAndDelete(key) {
						const value = store.get(key) ?? null;
						store.delete(key);
						return value;
					},
					increment(key) {
						const count = Number(store.get(key) ?? 0) + 1;
						store.set(key, String(count));
						return count;
					},
					delete(key) {
						store.delete(key);
					},
				},
			},
			{ clientOptions: { plugins: [multiSessionClient()] } },
		);
		const headers = new Headers();
		const first = await client.signIn.email(testUser, {
			onSuccess: cookieSetter(headers),
		});
		const second = await client.signUp.email(
			{ email: "second@test.com", password: "password", name: "Second user" },
			{ headers, onSuccess: cookieSetter(headers) },
		);
		expect(first.error).toBeNull();
		expect(second.error).toBeNull();
		expect(second.data?.token).toBeTypeOf("string");
		const firstToken = first.data!.token;
		const secondToken = second.data!.token!;
		const before = await client.multiSession.listDeviceSessions({
			fetchOptions: { headers },
		});
		expect(before.data).toHaveLength(2);

		return {
			auth,
			client,
			cookieSetter,
			headers,
			store,
			firstToken,
			secondToken,
		};
	}

	it("lists database-backed device sessions after cache eviction", async () => {
		const { client, headers, store, firstToken, secondToken } =
			await createDeviceSessions();
		store.clear();

		const listed = await client.multiSession.listDeviceSessions({
			fetchOptions: { headers },
		});
		expect(listed.error).toBeNull();
		expect(listed.data?.map(({ session }) => session.token).sort()).toEqual(
			[firstToken, secondToken].sort(),
		);
	});

	it("activates a remaining database session after revoking the active session", async () => {
		const {
			auth,
			client,
			cookieSetter,
			headers,
			store,
			firstToken,
			secondToken,
		} = await createDeviceSessions();
		store.clear();

		const current = await client.getSession({ fetchOptions: { headers } });
		expect(current.data?.session.token).toBe(secondToken);
		const revoked = await client.multiSession.revoke(
			{ sessionToken: secondToken },
			{ headers, onSuccess: cookieSetter(headers) },
		);
		expect(revoked.error).toBeNull();
		const { internalAdapter } = await auth.$context;
		expect(await internalAdapter.findSession(secondToken)).toBeNull();

		const active = await client.getSession({ fetchOptions: { headers } });
		expect(active.data?.session.token).toBe(firstToken);
	});

	it("selects the first held session after revocation across mixed cache hits", async () => {
		const { client, cookieSetter, headers, store, firstToken } =
			await createDeviceSessions();
		const third = await client.signUp.email(
			{ email: "third@test.com", password: "password", name: "Third user" },
			{ headers, onSuccess: cookieSetter(headers) },
		);
		expect(third.error).toBeNull();
		expect(third.data?.token).toBeTypeOf("string");
		store.delete(firstToken);

		const revoked = await client.multiSession.revoke(
			{ sessionToken: third.data!.token! },
			{ headers, onSuccess: cookieSetter(headers) },
		);
		expect(revoked.error).toBeNull();
		const active = await client.getSession({ fetchOptions: { headers } });
		expect(active.data?.session.token).toBe(firstToken);
	});
});

describe("multi-session", async () => {
	const { client, testUser, cookieSetter } = await getTestInstance(
		{
			plugins: [
				multiSession({
					maximumSessions: 2,
				}),
			],
		},
		{
			clientOptions: {
				plugins: [multiSessionClient()],
			},
		},
	);

	const headers = new Headers();
	const testUser2 = {
		email: "second-email@test.com",
		password: "password",
		name: "Name",
	};

	it("should set multi session when there is set-cookie header", async () => {
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onResponse(context) {
					const setCookieString = context.response.headers.get("set-cookie");
					const setCookies = parseSetCookieHeader(setCookieString || "");
					const sessionToken = setCookies
						.get("better-auth.session_token")
						?.value.split(".")[0];
					const multiSession = setCookies.get(
						`better-auth.session_token_multi-${sessionToken?.toLowerCase()}`,
					)?.value;
					expect(sessionToken).not.toBe(null);
					expect(multiSession).not.toBe(null);
					expect(multiSession).toContain(sessionToken);
					expect(setCookieString).toContain("better-auth.session_token_multi-");
				},
				onSuccess: cookieSetter(headers),
			},
		);
		await client.signUp.email(testUser2, {
			onSuccess: cookieSetter(headers),
		});
	});

	it("should get active session", async () => {
		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(session.data?.user.email).toBe(testUser2.email);
	});

	let sessionToken = "";
	it("should list all device sessions", async () => {
		const res = await client.multiSession.listDeviceSessions({
			fetchOptions: {
				headers,
			},
		});
		if (res.data) {
			sessionToken =
				res.data.find((s) => s.user.email === testUser.email)?.session.token ||
				"";
		}
		expect(res.data).toHaveLength(2);
	});

	it("should set active session when only multi-session cookies are present", async () => {
		const existingCookieHeader = headers.get("cookie") || "";
		const multiOnlyCookieHeader = existingCookieHeader
			.split(";")
			.map((cookie) => cookie.trim())
			.filter(Boolean)
			.filter((cookie) => !cookie.startsWith("better-auth.session_token="))
			.join("; ");

		const multiOnlyHeaders = new Headers();
		multiOnlyHeaders.set("cookie", multiOnlyCookieHeader);

		const res = await client.multiSession.setActive({
			sessionToken,
			fetchOptions: {
				headers: multiOnlyHeaders,
			},
		});
		expect(res.error).toBeNull();
		expect(res.data?.user.email).toBe(testUser.email);
	});

	it("should set active session", async () => {
		const res = await client.multiSession.setActive({
			sessionToken,
			fetchOptions: {
				headers,
			},
		});
		expect(res.data?.user.email).toBe(testUser.email);
	});

	it("should revoke a session and set the next active", async () => {
		const testUser3 = {
			email: "my-email@email.com",
			password: "password",
			name: "Name",
		};
		let token = "";
		await client.signUp.email(testUser3, {
			onSuccess: (ctx) => {
				const header = ctx.response.headers.get("set-cookie");
				expect(header).toContain("better-auth.session_token");
				const cookies = parseSetCookieHeader(header || "");
				token =
					cookies.get("better-auth.session_token")?.value.split(".")[0] || "";
			},
		});
		await client.multiSession.revoke(
			{
				sessionToken: token,
			},
			{
				onSuccess(context) {
					expect(context.response.headers.get("set-cookie")).toContain(
						`better-auth.session_token=`,
					);
				},
				headers,
			},
		);
		const res = await client.multiSession.listDeviceSessions({
			fetchOptions: {
				headers,
			},
		});
		expect(res.data).toHaveLength(2);
	});

	it("should sign-out all sessions", async () => {
		const newHeaders = new Headers();
		await client.signOut({
			fetchOptions: {
				headers,
				onSuccess: cookieSetter(newHeaders),
			},
		});
		const res = await client.multiSession.listDeviceSessions({
			fetchOptions: {
				headers,
			},
		});
		expect(res.data).toHaveLength(0);
		const res2 = await client.multiSession.listDeviceSessions({
			fetchOptions: {
				headers: newHeaders,
			},
		});
		expect(res2.data).toHaveLength(0);
	});

	it("should replace old multi-session cookie when same user signs in again", async () => {
		const sameUserHeaders = new Headers();
		const sameUser = {
			email: "same-user@test.com",
			password: "password",
			name: "Same User",
		};

		let firstSessionToken = "";
		await client.signUp.email(sameUser, {
			onSuccess: cookieSetter(sameUserHeaders),
			onResponse(context) {
				const header = context.response.headers.get("set-cookie");
				const cookies = parseSetCookieHeader(header || "");
				firstSessionToken =
					cookies.get("better-auth.session_token")?.value.split(".")[0] || "";
			},
		});

		const sessionsAfterFirst = await client.multiSession.listDeviceSessions({
			fetchOptions: { headers: sameUserHeaders },
		});
		const firstUserSessions = sessionsAfterFirst.data?.filter(
			(s) => s.user.email === sameUser.email,
		);
		expect(firstUserSessions).toHaveLength(1);

		let secondSessionToken = "";
		await client.signIn.email(
			{
				email: sameUser.email,
				password: sameUser.password,
			},
			{
				onSuccess: cookieSetter(sameUserHeaders),
				onResponse(context) {
					const header = context.response.headers.get("set-cookie");
					const cookies = parseSetCookieHeader(header || "");
					secondSessionToken =
						cookies.get("better-auth.session_token")?.value.split(".")[0] || "";
					// Verify old cookie is being deleted
					const oldCookieName = `better-auth.session_token_multi-${firstSessionToken.toLowerCase()}`;
					const oldCookie = cookies.get(oldCookieName);
					expect(oldCookie?.["max-age"]).toBe(0);
				},
				headers: sameUserHeaders,
			},
		);

		expect(secondSessionToken).not.toBe(firstSessionToken);
		const sessionsAfterSecond = await client.multiSession.listDeviceSessions({
			fetchOptions: { headers: sameUserHeaders },
		});
		const secondUserSessions = sessionsAfterSecond.data?.filter(
			(s) => s.user.email === sameUser.email,
		);
		expect(secondUserSessions).toHaveLength(1);
		expect(secondUserSessions?.[0]?.session.token).toBe(secondSessionToken);
	});

	it("should reject forged multi-session cookies on sign-out", async () => {
		const attackerUser = {
			email: "attacker@test.com",
			password: "password",
			name: "Attacker",
		};
		const victimUser = {
			email: "victim@test.com",
			password: "password",
			name: "Victim",
		};

		const attackerHeaders = new Headers();
		await client.signUp.email(attackerUser, {
			onSuccess: cookieSetter(attackerHeaders),
		});

		const victimHeaders = new Headers();
		let victimSessionToken = "";
		await client.signUp.email(victimUser, {
			onSuccess: cookieSetter(victimHeaders),
			onResponse(context) {
				const header = context.response.headers.get("set-cookie");
				const cookies = parseSetCookieHeader(header || "");
				victimSessionToken =
					cookies.get("better-auth.session_token")?.value.split(".")[0] || "";
			},
		});

		const attackerSession = await client.getSession({
			fetchOptions: { headers: attackerHeaders },
		});
		const victimSession = await client.getSession({
			fetchOptions: { headers: victimHeaders },
		});
		expect(attackerSession.data?.user.email).toBe(attackerUser.email);
		expect(victimSession.data?.user.email).toBe(victimUser.email);

		const forgedCookieName = `better-auth.session_token_multi-${victimSessionToken.toLowerCase()}`;
		const forgedCookieValue = `${victimSessionToken}.fake-signature`;

		const signOutHeaders = new Headers(attackerHeaders);
		signOutHeaders.set(
			"cookie",
			`${attackerHeaders.get("cookie")}; ${forgedCookieName}=${forgedCookieValue}`,
		);

		await client.signOut({
			fetchOptions: {
				headers: signOutHeaders,
			},
		});

		const victimSessionAfter = await client.getSession({
			fetchOptions: { headers: victimHeaders },
		});
		expect(victimSessionAfter.data?.user.email).toBe(victimUser.email);
		expect(victimSessionAfter.data?.session.token).toBe(victimSessionToken);

		const attackerSessionAfter = await client.getSession({
			fetchOptions: { headers: attackerHeaders },
		});
		expect(attackerSessionAfter.data).toBeNull();
	});

	it("binds set-active and revoke to the signed cookie value, not the body token", async () => {
		// A validly-signed multi-session cookie must only act on the session it was
		// signed for. The signature covers the cookie value, not its name, so a
		// request that presents its own valid cookie under another session's cookie
		// name (naming that other token in the body) must not revoke the other
		// session.
		const callerUser = {
			email: "ms-bind-caller@test.com",
			password: "password",
			name: "Caller",
		};
		const otherUser = {
			email: "ms-bind-other@test.com",
			password: "password",
			name: "Other",
		};

		const callerHeaders = new Headers();
		let callerToken = "";
		let callerSignedMultiCookie = "";
		await client.signUp.email(callerUser, {
			onSuccess: cookieSetter(callerHeaders),
			onResponse(context) {
				const cookies = parseSetCookieHeader(
					context.response.headers.get("set-cookie") || "",
				);
				callerToken =
					cookies.get("better-auth.session_token")?.value.split(".")[0] || "";
				callerSignedMultiCookie =
					cookies.get(
						`better-auth.session_token_multi-${callerToken.toLowerCase()}`,
					)?.value || "";
			},
		});

		const otherHeaders = new Headers();
		let otherToken = "";
		await client.signUp.email(otherUser, {
			onSuccess: cookieSetter(otherHeaders),
			onResponse(context) {
				const cookies = parseSetCookieHeader(
					context.response.headers.get("set-cookie") || "",
				);
				otherToken =
					cookies.get("better-auth.session_token")?.value.split(".")[0] || "";
			},
		});
		expect(callerSignedMultiCookie).not.toBe("");
		expect(otherToken).not.toBe("");

		// Place the caller's own validly-signed multi-session cookie under the other
		// session's cookie name and name the other token in the request body.
		const craftedHeaders = new Headers(callerHeaders);
		craftedHeaders.set(
			"cookie",
			`${callerHeaders.get("cookie")}; better-auth.session_token_multi-${otherToken.toLowerCase()}=${callerSignedMultiCookie}`,
		);

		await client.multiSession.revoke(
			{ sessionToken: otherToken },
			{ headers: craftedHeaders },
		);

		const otherAfter = await client.getSession({
			fetchOptions: { headers: otherHeaders },
		});
		expect(otherAfter.data?.session.token).toBe(otherToken);
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/12904
 */
describe("multi-session with admin impersonation", async () => {
	const { auth, client, testUser, cookieSetter } = await getTestInstance(
		{
			plugins: [admin(), multiSession({ maximumSessions: 5 })],
			databaseHooks: {
				user: {
					create: {
						before: async (user) => ({
							data: {
								...user,
								role: user.name === "Admin" ? "admin" : user.role,
							},
						}),
					},
				},
			},
		},
		{
			clientOptions: { plugins: [adminClient(), multiSessionClient()] },
			testUser: { name: "Admin" },
		},
	);

	it("keeps the target's real session and device listing through impersonation", async () => {
		const deviceHeaders = new Headers();
		const target = {
			email: "impersonation-target@test.com",
			password: "password",
			name: "Target",
		};
		const targetSession = await client.signUp.email(target, {
			onSuccess: cookieSetter(deviceHeaders),
		});
		expect(targetSession.error).toBeNull();
		const adminSession = await client.signIn.email(testUser, {
			headers: deviceHeaders,
			onSuccess: cookieSetter(deviceHeaders),
		});
		expect(adminSession.error).toBeNull();
		const adminHeaders = new Headers(deviceHeaders);
		const adminToken = adminSession.data!.token!;
		const targetToken = targetSession.data!.token!;

		const before = await client.multiSession.listDeviceSessions({
			fetchOptions: { headers: adminHeaders },
		});
		expect(before.data?.map((s) => s.session.token).sort()).toEqual(
			[adminToken, targetToken].sort(),
		);

		const impersonationHeaders = new Headers(deviceHeaders);
		let impersonationToken = "";
		let impersonationSetCookie = "";
		const impersonated = await client.admin.impersonateUser(
			{ userId: targetSession.data!.user.id },
			{
				headers: deviceHeaders,
				onSuccess: cookieSetter(impersonationHeaders),
				onResponse(context) {
					impersonationSetCookie =
						context.response.headers.get("set-cookie") || "";
					impersonationToken =
						parseSetCookieHeader(impersonationSetCookie)
							.get("better-auth.session_token")
							?.value.split(".")[0] || "";
				},
			},
		);
		expect(impersonated.error).toBeNull();
		expect(impersonationToken).not.toBe("");
		expect(impersonationToken).not.toBe(targetToken);

		const { internalAdapter } = await auth.$context;
		expect(await internalAdapter.findSession(targetToken)).not.toBeNull();
		expect(impersonationSetCookie).not.toContain(
			`better-auth.session_token_multi-${impersonationToken.toLowerCase()}`,
		);

		const during = await client.multiSession.listDeviceSessions({
			fetchOptions: { headers: impersonationHeaders },
		});
		expect(during.data?.map((s) => s.session.token).sort()).toEqual(
			[adminToken, targetToken].sort(),
		);

		let stopImpersonatingSetCookie = "";
		const stopped = await client.admin.stopImpersonating(
			{},
			{
				headers: impersonationHeaders,
				onSuccess: cookieSetter(impersonationHeaders),
				onResponse(context) {
					stopImpersonatingSetCookie =
						context.response.headers.get("set-cookie") || "";
				},
			},
		);
		expect(stopped.error).toBeNull();
		expect(
			parseSetCookieHeader(stopImpersonatingSetCookie).get(
				"better-auth.dont_remember",
			)?.["max-age"],
		).toBe(0);
		expect(await internalAdapter.findSession(targetToken)).not.toBeNull();
		const after = await client.multiSession.listDeviceSessions({
			fetchOptions: { headers: impersonationHeaders },
		});
		expect(after.data?.map((s) => s.session.token).sort()).toEqual(
			[adminToken, targetToken].sort(),
		);
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/12904
 */
describe("multi-session stale device cookies", async () => {
	const { auth, client, cookieSetter } = await getTestInstance(
		{ plugins: [multiSession({ maximumSessions: 2 })] },
		{ clientOptions: { plugins: [multiSessionClient()] } },
	);

	it("expires deleted device sessions instead of counting them toward the limit", async () => {
		const headers = new Headers();
		const first = await client.signUp.email(
			{ email: "stale-one@test.com", password: "password", name: "One" },
			{ onSuccess: cookieSetter(headers) },
		);
		const second = await client.signUp.email(
			{ email: "stale-two@test.com", password: "password", name: "Two" },
			{ headers, onSuccess: cookieSetter(headers) },
		);
		expect(first.error).toBeNull();
		expect(second.error).toBeNull();

		const { internalAdapter } = await auth.$context;
		await internalAdapter.deleteSession(first.data!.token!);
		await internalAdapter.deleteSession(second.data!.token!);

		let setCookie = "";
		const fresh = await client.signUp.email(
			{ email: "fresh@test.com", password: "password", name: "Fresh" },
			{
				headers,
				onSuccess: cookieSetter(headers),
				onResponse(context) {
					setCookie = context.response.headers.get("set-cookie") || "";
				},
			},
		);
		expect(fresh.error).toBeNull();
		const cookies = parseSetCookieHeader(setCookie);
		expect(
			cookies.get(
				`better-auth.session_token_multi-${fresh.data!.token!.toLowerCase()}`,
			)?.value,
		).toBeTruthy();
		for (const token of [first.data!.token!, second.data!.token!]) {
			expect(
				cookies.get(`better-auth.session_token_multi-${token.toLowerCase()}`)?.[
					"max-age"
				],
			).toBe(0);
		}
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/12904
 */
describe("multi-session cookie ownership", async () => {
	const first = await getTestInstance(
		{
			baseURL: "http://localhost:3000",
			advanced: { cookiePrefix: "first" },
			plugins: [multiSession()],
		},
		{ clientOptions: { plugins: [multiSessionClient()] } },
	);
	const second = await getTestInstance(
		{
			baseURL: "http://localhost:3000",
			advanced: { cookiePrefix: "second" },
			plugins: [multiSession()],
		},
		{ clientOptions: { plugins: [multiSessionClient()] } },
	);

	it("leaves another instance's device cookies untouched on sign-in", async () => {
		const firstHeaders = new Headers();
		const firstSession = await first.client.signUp.email(
			{ email: "first@test.com", password: "password", name: "First" },
			{ onSuccess: first.cookieSetter(firstHeaders) },
		);
		expect(firstSession.error).toBeNull();
		const foreignCookieName = `first.session_token_multi-${firstSession.data!.token!.toLowerCase()}`;
		const foreignCookie = parseCookies(firstHeaders.get("cookie") || "").get(
			foreignCookieName,
		);
		expect(foreignCookie).toBeTruthy();

		let setCookie = "";
		const secondSession = await second.client.signUp.email(
			{ email: "second@test.com", password: "password", name: "Second" },
			{
				headers: new Headers({
					cookie: `${foreignCookieName}=${foreignCookie}`,
				}),
				onResponse(context) {
					setCookie = context.response.headers.get("set-cookie") || "";
				},
			},
		);
		expect(secondSession.error).toBeNull();
		expect(setCookie).not.toContain(`${foreignCookieName}=;`);
		expect(setCookie).toContain(
			`second.session_token_multi-${secondSession.data!.token!.toLowerCase()}`,
		);

		const listed = await first.client.multiSession.listDeviceSessions({
			fetchOptions: { headers: firstHeaders },
		});
		expect(listed.data?.map((s) => s.session.token)).toEqual([
			firstSession.data!.token,
		]);
	});
});

/**
 * @see https://github.com/better-auth/better-auth/issues/12904
 */
describe("multi-session leftover impersonation cookie", async () => {
	const { auth, client, cookieSetter } = await getTestInstance(
		{ plugins: [admin(), multiSession({ maximumSessions: 1 })] },
		{ clientOptions: { plugins: [multiSessionClient()] } },
	);

	it("frees the slot of a pre-upgrade impersonation cookie", async () => {
		const headers = new Headers();
		const old = await client.signUp.email(
			{
				email: "old-impersonation@test.com",
				password: "password",
				name: "Old Impersonation",
			},
			{ onSuccess: cookieSetter(headers) },
		);
		expect(old.error).toBeNull();
		const oldToken = old.data!.token!;
		const { internalAdapter } = await auth.$context;
		await internalAdapter.updateSession(oldToken, {
			impersonatedBy: "admin-id",
		});

		let setCookie = "";
		const fresh = await client.signUp.email(
			{
				email: "after-impersonation@test.com",
				password: "password",
				name: "Fresh",
			},
			{
				headers,
				onSuccess: cookieSetter(headers),
				onResponse(context) {
					setCookie = context.response.headers.get("set-cookie") || "";
				},
			},
		);
		expect(fresh.error).toBeNull();
		const cookies = parseSetCookieHeader(setCookie);
		expect(
			cookies.get(
				`better-auth.session_token_multi-${oldToken.toLowerCase()}`,
			)?.["max-age"],
		).toBe(0);
		expect(
			cookies.get(
				`better-auth.session_token_multi-${fresh.data!.token!.toLowerCase()}`,
			)?.value,
		).toBeTruthy();
		expect(await internalAdapter.findSession(oldToken)).not.toBeNull();
	});
});
