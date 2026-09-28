import type { SecondaryStorage } from "@better-auth/core/db";
import { safeJSONParse } from "@better-auth/core/utils/json";
import { base64Url } from "@better-auth/utils/base64";
import { createHash } from "@better-auth/utils/hash";
import { serializeSignedCookie } from "better-call";
import { beforeEach, describe, expect, it } from "vitest";
import { parseSetCookieHeader } from "../cookies";
import { admin } from "../plugins/admin/admin";
import { bearer } from "../plugins/bearer";
import { deviceAuthorization } from "../plugins/device-authorization";
import { multiSession } from "../plugins/multi-session";
import { getTestInstance } from "../test-utils/test-instance";
import type { Session } from "../types";

const SESSION_COOKIE = "better-auth.session_token";

async function sha256(token: string) {
	const hash = await createHash("SHA-256").digest(
		new TextEncoder().encode(token),
	);
	return base64Url.encode(new Uint8Array(hash), { padding: false });
}

function createMemoryStorage(store: Map<string, string>): SecondaryStorage {
	return {
		set(key, value) {
			store.set(key, value);
		},
		get(key) {
			return store.get(key) ?? null;
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
	};
}

/**
 * Merge every `set-cookie` of a response into a request `cookie` header.
 */
function mergeCookies(headers: Headers, setCookie: string | null) {
	const jar = new Map<string, string>();
	for (const part of (headers.get("cookie") ?? "").split(";")) {
		const [name, ...rest] = part.trim().split("=");
		if (name) jar.set(name, rest.join("="));
	}
	for (const [name, cookie] of parseSetCookieHeader(setCookie ?? "")) {
		if (cookie["max-age"] === 0 || cookie.value === "") jar.delete(name);
		else jar.set(name, cookie.value);
	}
	headers.set(
		"cookie",
		[...jar].map(([name, value]) => `${name}=${value}`).join("; "),
	);
	return headers;
}

type WithHeaders<R> = Promise<{ headers: Headers; response: R }>;
type TestAuth = {
	api: {
		signInEmail: (input: {
			body: { email: string; password: string };
			returnHeaders: true;
		}) => WithHeaders<{ token: string }>;
		signUpEmail: (input: {
			body: { email: string; password: string; name: string };
			returnHeaders: true;
		}) => WithHeaders<{ token: string | null; user: { id: string } }>;
	};
};

async function signIn(auth: TestAuth, email: string, password: string) {
	const { headers: responseHeaders, response } = await auth.api.signInEmail({
		body: { email, password },
		returnHeaders: true,
	});
	const headers = mergeCookies(
		new Headers(),
		responseHeaders.get("set-cookie"),
	);
	return { token: response.token, headers };
}

async function signUp(auth: TestAuth, email: string) {
	const { headers: responseHeaders, response } = await auth.api.signUpEmail({
		body: { email, password: "password1234", name: email },
		returnHeaders: true,
	});
	const headers = mergeCookies(
		new Headers(),
		responseHeaders.get("set-cookie"),
	);
	return { token: response.token!, user: response.user, headers };
}

async function signedCookieHeaders(value: string, secret: string) {
	const cookie = await serializeSignedCookie(SESSION_COOKIE, value, secret);
	return new Headers({ cookie: cookie.split(";")[0]! });
}

describe("session.storeTokenHash (database)", async () => {
	const { auth, db, testUser } = await getTestInstance({
		session: {
			storeTokenHash: true,
			additionalFields: {
				deviceName: { type: "string", required: false },
			},
		},
		plugins: [bearer()],
	});
	const ctx = await auth.$context;

	async function findRows(userId?: string) {
		return db.findMany<Session>({
			model: "session",
			where: userId ? [{ field: "userId", value: userId }] : [],
		});
	}

	it("stores the SHA-256 of the token, never the raw token", async () => {
		const { token, headers } = await signIn(
			auth,
			testUser.email,
			testUser.password,
		);
		const rows = await findRows();
		const hashed = await sha256(token);
		expect(rows.some((row) => row.token === token)).toBe(false);
		expect(rows.some((row) => row.token === hashed)).toBe(true);
		expect(headers.get("cookie")).toContain(token);
	});

	it("returns the raw token from createSession and findSession", async () => {
		const user = (await findRows())[0]!.userId;
		const created = await ctx.internalAdapter.createSession(user);
		const stored = await findRows(user);
		expect(stored.some((row) => row.token === created.token)).toBe(false);
		const found = await ctx.internalAdapter.findSession(created.token);
		expect(found?.session.token).toBe(created.token);
		const many = await ctx.internalAdapter.findSessions([created.token]);
		expect(many).toHaveLength(1);
		expect(many[0]!.session.token).toBe(created.token);
	});

	it("resolves get-session from the cookie with the raw token", async () => {
		const { token, headers } = await signIn(
			auth,
			testUser.email,
			testUser.password,
		);
		const session = await auth.api.getSession({ headers });
		expect(session?.session.token).toBe(token);
		expect(session?.user.email).toBe(testUser.email);
	});

	it("updates the session through update-session", async () => {
		const { token, headers } = await signIn(
			auth,
			testUser.email,
			testUser.password,
		);
		const updated = await auth.api.updateSession({
			body: { deviceName: "laptop" },
			headers,
		});
		expect(updated.session.token).toBe(token);
		const row = (await findRows()).find((r) => r.id === updated.session.id) as
			| (Session & { deviceName?: string })
			| undefined;
		expect(row?.deviceName).toBe("laptop");
	});

	it("rejects the stored hash as a cookie or bearer token", async () => {
		const { token } = await signIn(auth, testUser.email, testUser.password);
		const leaked = await sha256(token);
		const asCookie = await auth.api.getSession({
			headers: await signedCookieHeaders(leaked, ctx.secret),
		});
		expect(asCookie).toBeNull();
		const asBearer = await auth.api.getSession({
			headers: new Headers({ authorization: `Bearer ${leaked}` }),
		});
		expect(asBearer).toBeNull();
		expect(await ctx.internalAdapter.findSession(leaked)).toBeNull();
		expect(await ctx.internalAdapter.findSessions([leaked])).toEqual([]);
		// Positive control: the raw token works as a bearer token.
		const withRaw = await auth.api.getSession({
			headers: new Headers({ authorization: `Bearer ${token}` }),
		});
		expect(withRaw?.session.token).toBe(token);
	});

	it("signs out by deleting the hashed row", async () => {
		const { token, headers } = await signIn(
			auth,
			testUser.email,
			testUser.password,
		);
		const hashed = await sha256(token);
		expect((await findRows()).some((row) => row.token === hashed)).toBe(true);
		await auth.api.signOut({ headers });
		expect((await findRows()).some((row) => row.token === hashed)).toBe(false);
		expect(await auth.api.getSession({ headers })).toBeNull();
	});

	it("revokes a session by its raw token", async () => {
		const current = await signIn(auth, testUser.email, testUser.password);
		const other = await signIn(auth, testUser.email, testUser.password);
		await auth.api.revokeSession({
			body: { token: other.token },
			headers: current.headers,
		});
		expect(await auth.api.getSession({ headers: other.headers })).toBeNull();
		expect(await auth.api.getSession({ headers: current.headers })).not.toBe(
			null,
		);
	});

	it("lists hashed tokens and revokes by the listed value", async () => {
		const current = await signIn(auth, testUser.email, testUser.password);
		const other = await signIn(auth, testUser.email, testUser.password);
		const listed = await auth.api.listSessions({ headers: current.headers });
		const otherHash = await sha256(other.token);
		expect(listed.some((s) => s.token === other.token)).toBe(false);
		expect(listed.some((s) => s.token === otherHash)).toBe(true);
		await auth.api.revokeSession({
			body: { token: otherHash },
			headers: current.headers,
		});
		expect(await auth.api.getSession({ headers: other.headers })).toBeNull();
		expect(await auth.api.getSession({ headers: current.headers })).not.toBe(
			null,
		);
	});

	it("does not revoke another user's session by its stored hash", async () => {
		const victim = await signUp(auth, "victim-db@test.com");
		const attacker = await signIn(auth, testUser.email, testUser.password);
		await auth.api.revokeSession({
			body: { token: await sha256(victim.token) },
			headers: attacker.headers,
		});
		expect(await auth.api.getSession({ headers: victim.headers })).not.toBe(
			null,
		);
	});

	it("revoke-other-sessions keeps the current session", async () => {
		const current = await signIn(auth, testUser.email, testUser.password);
		const other = await signIn(auth, testUser.email, testUser.password);
		await auth.api.revokeOtherSessions({ headers: current.headers });
		expect(await auth.api.getSession({ headers: other.headers })).toBeNull();
		const stillActive = await auth.api.getSession({
			headers: current.headers,
		});
		expect(stillActive?.session.token).toBe(current.token);
	});

	it("revoke-sessions removes every session", async () => {
		const current = await signIn(auth, testUser.email, testUser.password);
		const other = await signIn(auth, testUser.email, testUser.password);
		await auth.api.revokeSessions({ headers: current.headers });
		expect(await auth.api.getSession({ headers: other.headers })).toBeNull();
		expect(await auth.api.getSession({ headers: current.headers })).toBeNull();
	});

	it("deleteSessions accepts raw tokens and stored hashes", async () => {
		const a = await signIn(auth, testUser.email, testUser.password);
		const b = await signIn(auth, testUser.email, testUser.password);
		await ctx.internalAdapter.deleteSessions([a.token, await sha256(b.token)]);
		expect(await auth.api.getSession({ headers: a.headers })).toBeNull();
		expect(await auth.api.getSession({ headers: b.headers })).toBeNull();
	});
});

describe("session.storeTokenHash (session refresh)", async () => {
	const { auth, db, testUser } = await getTestInstance({
		session: { storeTokenHash: true, updateAge: 0 },
	});

	it("refreshes the session and keeps the raw token in the cookie", async () => {
		const { token, headers } = await signIn(
			auth,
			testUser.email,
			testUser.password,
		);
		const hashed = await sha256(token);
		const before = await db.findOne<Session>({
			model: "session",
			where: [{ field: "token", value: hashed }],
		});
		await new Promise((resolve) => setTimeout(resolve, 20));
		const { headers: responseHeaders, response } = await auth.api.getSession({
			headers,
			returnHeaders: true,
		});
		expect(response?.session.token).toBe(token);
		const cookie = parseSetCookieHeader(
			responseHeaders.get("set-cookie") ?? "",
		).get(SESSION_COOKIE);
		expect(cookie?.value.split(".")[0]).toBe(token);
		const after = await db.findOne<Session>({
			model: "session",
			where: [{ field: "token", value: hashed }],
		});
		expect(after!.expiresAt.getTime()).toBeGreaterThan(
			before!.expiresAt.getTime(),
		);
	});
});

describe("session.storeTokenHash (cookie cache)", async () => {
	const { auth, testUser } = await getTestInstance({
		session: {
			storeTokenHash: true,
			cookieCache: { enabled: true, maxAge: 60 },
		},
	});

	it("serves the cached session with the raw token", async () => {
		const { token, headers } = await signIn(
			auth,
			testUser.email,
			testUser.password,
		);
		const first = await auth.api.getSession({ headers, returnHeaders: true });
		mergeCookies(headers, first.headers.get("set-cookie"));
		expect(headers.get("cookie")).toContain("better-auth.session_data");
		const cached = await auth.api.getSession({ headers });
		expect(cached?.session.token).toBe(token);
	});
});

describe("session.storeTokenHash (secondary storage)", async () => {
	const store = new Map<string, string>();
	const { auth, testUser } = await getTestInstance({
		secondaryStorage: createMemoryStorage(store),
		session: { storeTokenHash: true, updateAge: 0 },
		plugins: [
			bearer(),
			deviceAuthorization({ expiresIn: "5min", interval: "2s" }),
		],
	});
	const ctx = await auth.$context;

	beforeEach(() => {
		store.clear();
	});

	function storedValues() {
		return [...store.entries()].map(([k, v]) => `${k}=${v}`).join("\n");
	}

	it("keys and lists sessions by hash only", async () => {
		const { token, headers } = await signIn(
			auth,
			testUser.email,
			testUser.password,
		);
		const hashed = await sha256(token);
		expect(store.has(hashed)).toBe(true);
		expect(storedValues()).not.toContain(token);
		const session = await auth.api.getSession({ headers });
		expect(session?.session.token).toBe(token);
		const list = safeJSONParse<{ token: string }[]>(
			store.get(`active-sessions-${session!.user.id}`)!,
		);
		expect(list?.map((entry) => entry.token)).toEqual([hashed]);
		// The refresh (updateAge: 0) rewrote storage without leaking the token.
		expect(storedValues()).not.toContain(token);
	});

	it("rejects the stored hash as a bearer token", async () => {
		const { token } = await signIn(auth, testUser.email, testUser.password);
		const asBearer = await auth.api.getSession({
			headers: new Headers({ authorization: `Bearer ${await sha256(token)}` }),
		});
		expect(asBearer).toBeNull();
	});

	it("lists sessions and revokes by the listed value", async () => {
		const current = await signIn(auth, testUser.email, testUser.password);
		const other = await signIn(auth, testUser.email, testUser.password);
		const listed = await auth.api.listSessions({ headers: current.headers });
		expect(listed.map((s) => s.token)).not.toContain(other.token);
		const otherHash = await sha256(other.token);
		expect(listed.map((s) => s.token)).toContain(otherHash);
		await auth.api.revokeSession({
			body: { token: otherHash },
			headers: current.headers,
		});
		expect(store.has(otherHash)).toBe(false);
		expect(await auth.api.getSession({ headers: other.headers })).toBeNull();
		expect(await auth.api.getSession({ headers: current.headers })).not.toBe(
			null,
		);
	});

	it("revoke-other-sessions keeps the current session", async () => {
		const current = await signIn(auth, testUser.email, testUser.password);
		const other = await signIn(auth, testUser.email, testUser.password);
		await auth.api.revokeOtherSessions({ headers: current.headers });
		expect(await auth.api.getSession({ headers: other.headers })).toBeNull();
		expect(await auth.api.getSession({ headers: current.headers })).not.toBe(
			null,
		);
	});

	it("signs out by deleting the hashed key", async () => {
		const { token, headers } = await signIn(
			auth,
			testUser.email,
			testUser.password,
		);
		await auth.api.signOut({ headers });
		expect(store.has(await sha256(token))).toBe(false);
		expect(await auth.api.getSession({ headers })).toBeNull();
	});

	it("deleteSessions accepts raw tokens and stored hashes", async () => {
		const a = await signIn(auth, testUser.email, testUser.password);
		const b = await signIn(auth, testUser.email, testUser.password);
		await ctx.internalAdapter.deleteSessions([a.token, await sha256(b.token)]);
		expect(store.has(await sha256(a.token))).toBe(false);
		expect(store.has(await sha256(b.token))).toBe(false);
	});

	it("ignores revocation of an unknown token", async () => {
		const { headers } = await signIn(auth, testUser.email, testUser.password);
		const sizeBefore = store.size;
		await ctx.internalAdapter.deleteSession("unknown-token");
		expect(store.size).toBe(sizeBefore);
		expect(await auth.api.getSession({ headers })).not.toBeNull();
	});

	it("does not store the device access token in plain text", async () => {
		const { headers } = await signIn(auth, testUser.email, testUser.password);
		const { device_code, user_code } = await auth.api.deviceCode({
			body: { client_id: "test-client" },
		});
		await auth.api.deviceVerify({ query: { user_code }, headers });
		await auth.api.deviceApprove({ body: { userCode: user_code }, headers });
		const tokenResponse = await auth.api.deviceToken({
			body: {
				grant_type: "urn:ietf:params:oauth:grant-type:device_code",
				device_code,
				client_id: "test-client",
			},
		});
		const accessToken =
			"access_token" in tokenResponse ? tokenResponse.access_token : "";
		expect(accessToken).not.toBe("");
		expect(storedValues()).not.toContain(accessToken);
		const session = await auth.api.getSession({
			headers: new Headers({ authorization: `Bearer ${accessToken}` }),
		});
		expect(session?.session.token).toBe(accessToken);
	});
});

describe("session.storeTokenHash (secondary storage + database)", async () => {
	const store = new Map<string, string>();
	const { auth, db, testUser } = await getTestInstance({
		secondaryStorage: createMemoryStorage(store),
		session: { storeTokenHash: true, storeSessionInDatabase: true },
	});

	it("hashes the token in both stores and revokes by hash", async () => {
		const current = await signIn(auth, testUser.email, testUser.password);
		const other = await signIn(auth, testUser.email, testUser.password);
		const otherHash = await sha256(other.token);
		const rows = await db.findMany<Session>({ model: "session" });
		expect(rows.map((row) => row.token)).toContain(otherHash);
		expect(rows.map((row) => row.token)).not.toContain(other.token);
		expect(store.has(otherHash)).toBe(true);
		await auth.api.revokeSession({
			body: { token: otherHash },
			headers: current.headers,
		});
		expect(store.has(otherHash)).toBe(false);
		const remaining = await db.findMany<Session>({ model: "session" });
		expect(remaining.map((row) => row.token)).not.toContain(otherHash);
	});

	it("deletes the database row when the cache entry is already gone", async () => {
		const { token } = await signIn(auth, testUser.email, testUser.password);
		const hashed = await sha256(token);
		store.delete(hashed);
		const ctx = await auth.$context;
		await ctx.internalAdapter.deleteSession(token);
		const rows = await db.findMany<Session>({ model: "session" });
		expect(rows.map((row) => row.token)).not.toContain(hashed);
	});
});

describe("session.storeTokenHash (session create hook)", async () => {
	let cancelSessionCreation = false;
	const hookTokens: string[] = [];
	const { auth, testUser } = await getTestInstance({
		session: { storeTokenHash: true },
		databaseHooks: {
			session: {
				create: {
					before: async (session) => {
						hookTokens.push(session.token);
						return !cancelSessionCreation;
					},
				},
			},
		},
	});

	it("gives hooks the hashed token", async () => {
		const { token } = await signIn(auth, testUser.email, testUser.password);
		expect(hookTokens.at(-1)).toBe(await sha256(token));
	});

	it("returns null when a hook cancels session creation", async () => {
		cancelSessionCreation = true;
		const ctx = await auth.$context;
		const user = await ctx.internalAdapter.findUserByEmail(testUser.email);
		expect(await ctx.internalAdapter.createSession(user!.user.id)).toBeNull();
	});
});

describe("session.storeTokenHash (secondary storage + preserved rows)", async () => {
	const store = new Map<string, string>();
	const { auth, db, testUser } = await getTestInstance({
		secondaryStorage: createMemoryStorage(store),
		session: {
			storeTokenHash: true,
			storeSessionInDatabase: true,
			preserveSessionInDatabase: true,
		},
	});
	const ctx = await auth.$context;

	it("ends the preserved row when revoked by raw token or hash", async () => {
		const a = await signIn(auth, testUser.email, testUser.password);
		const b = await signIn(auth, testUser.email, testUser.password);
		await ctx.internalAdapter.deleteSession(a.token);
		await ctx.internalAdapter.deleteSessions([await sha256(b.token)]);
		for (const token of [a.token, b.token]) {
			const row = await db.findOne<Session>({
				model: "session",
				where: [{ field: "token", value: await sha256(token) }],
			});
			expect(row).not.toBeNull();
			expect(row!.expiresAt.getTime()).toBeLessThanOrEqual(Date.now());
		}
	});
});

describe("session.storeTokenHash (multi-session)", async () => {
	const { auth, db, testUser } = await getTestInstance({
		session: { storeTokenHash: true },
		plugins: [multiSession()],
	});

	it("lists device sessions with raw tokens and revokes them", async () => {
		const headers = new Headers();
		const first = await auth.api.signInEmail({
			body: { email: testUser.email, password: testUser.password },
			returnHeaders: true,
		});
		mergeCookies(headers, first.headers.get("set-cookie"));
		const second = await auth.api.signUpEmail({
			body: {
				email: "multi@test.com",
				password: "password1234",
				name: "multi",
			},
			headers,
			returnHeaders: true,
		});
		mergeCookies(headers, second.headers.get("set-cookie"));

		const rows = await db.findMany<Session>({ model: "session" });
		expect(rows.map((row) => row.token)).not.toContain(first.response.token);

		const deviceSessions = await auth.api.listDeviceSessions({ headers });
		expect(deviceSessions).toHaveLength(2);
		expect(deviceSessions.map((s) => s.session.token)).toContain(
			first.response.token,
		);

		const res = await auth.api.revokeDeviceSession({
			body: { sessionToken: first.response.token },
			headers,
			returnHeaders: true,
		});
		mergeCookies(headers, res.headers.get("set-cookie"));
		const after = await auth.api.listDeviceSessions({ headers });
		expect(after.map((s) => s.session.token)).not.toContain(
			first.response.token,
		);
		const hashed = await sha256(first.response.token);
		const remaining = await db.findMany<Session>({ model: "session" });
		expect(remaining.map((row) => row.token)).not.toContain(hashed);
	});
});

describe("session.storeTokenHash (admin)", async () => {
	const { auth, testUser } = await getTestInstance({
		session: { storeTokenHash: true },
		plugins: [admin()],
	});

	it("revokes a user session by the value listUserSessions returns", async () => {
		const adminSession = await signIn(auth, testUser.email, testUser.password);
		const ctx = await auth.$context;
		const adminUser = await auth.api.getSession({
			headers: adminSession.headers,
		});
		await ctx.internalAdapter.updateUser(adminUser!.user.id, {
			role: "admin",
		});
		const target = await signUp(auth, "target@test.com");
		const { sessions } = await auth.api.listUserSessions({
			body: { userId: target.user.id },
			headers: adminSession.headers,
		});
		expect(sessions).toHaveLength(1);
		expect(sessions[0]!.token).not.toBe(target.token);
		expect(sessions[0]!.token).toBe(await sha256(target.token));
		await auth.api.revokeUserSession({
			body: { sessionToken: sessions[0]!.token },
			headers: adminSession.headers,
		});
		expect(await auth.api.getSession({ headers: target.headers })).toBeNull();
	});
});

describe("session.storeTokenHash disabled (default)", async () => {
	const { auth, db, testUser } = await getTestInstance();

	it("stores the raw token as before", async () => {
		const { token } = await signIn(auth, testUser.email, testUser.password);
		const rows = await db.findMany<Session>({ model: "session" });
		expect(rows.map((row) => row.token)).toContain(token);
	});
});

describe("session.storeTokenHash disabled with secondary storage", async () => {
	const store = new Map<string, string>();
	const { auth, testUser } = await getTestInstance({
		secondaryStorage: createMemoryStorage(store),
		plugins: [deviceAuthorization({ expiresIn: "5min", interval: "2s" })],
	});

	it("keys the device session by its raw token as before", async () => {
		const { token, headers } = await signIn(
			auth,
			testUser.email,
			testUser.password,
		);
		expect(store.has(token)).toBe(true);
		const { device_code, user_code } = await auth.api.deviceCode({
			body: { client_id: "test-client" },
		});
		await auth.api.deviceVerify({ query: { user_code }, headers });
		await auth.api.deviceApprove({ body: { userCode: user_code }, headers });
		const tokenResponse = await auth.api.deviceToken({
			body: {
				grant_type: "urn:ietf:params:oauth:grant-type:device_code",
				device_code,
				client_id: "test-client",
			},
		});
		const accessToken =
			"access_token" in tokenResponse ? tokenResponse.access_token : "";
		expect(store.has(accessToken)).toBe(true);
	});
});
