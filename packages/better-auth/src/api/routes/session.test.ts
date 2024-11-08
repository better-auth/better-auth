import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { parseSetCookieHeader } from "../../cookies";
import { getDate } from "../../utils/date";
import type { Session } from "../../types";

describe("session", async () => {
	const { client, testUser, sessionSetter } = await getTestInstance();

	it("should set cookies correctly on sign in", async () => {
		const res = await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess(context) {
					const header = context.response.headers.get("set-cookie");
					const cookies = parseSetCookieHeader(header || "");
					expect(cookies.get("better-auth.session_token")).toMatchObject({
						value: expect.any(String),
						"max-age": (60 * 60 * 24 * 7).toString(),
						path: "/",
						httponly: true,
						samesite: "Lax",
					});
				},
			},
		);
		const expiresAt = new Date(res.data?.session?.expiresAt || "");
		const now = new Date();

		expect(expiresAt.getTime()).toBeGreaterThan(
			now.getTime() + 6 * 24 * 60 * 60 * 1000,
		);
	});

	it("should return null when not authenticated", async () => {
		const response = await client.getSession();
		expect(response.data).toBeNull();
	});

	it("should update session when close to expiry", async () => {
		let headers = new Headers();
		const res = await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess(context) {
					const header = context.response.headers.get("set-cookie");
					const cookies = parseSetCookieHeader(header || "");
					const signedCookie = cookies.get("better-auth.session_token")?.value;
					headers.set("cookie", `better-auth.session_token=${signedCookie}`);
				},
			},
		);

		if (!res.data?.session) {
			throw new Error("No session found");
		}
		const after7Days = new Date();
		after7Days.setDate(after7Days.getDate() + 6);
		expect(
			new Date(res.data?.session.expiresAt).getTime(),
		).toBeGreaterThanOrEqual(after7Days.getTime());

		const nearExpiryDate = new Date();
		nearExpiryDate.setDate(nearExpiryDate.getDate() + 6);
		vi.setSystemTime(nearExpiryDate);
		const response = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		if (!response.data?.session) {
			throw new Error("No session found");
		}
		nearExpiryDate.setDate(nearExpiryDate.getDate() + 7);
		expect(
			new Date(response.data?.session?.expiresAt).getTime(),
		).toBeGreaterThanOrEqual(nearExpiryDate.getTime());
	});

	it("should handle 'don't remember me' option", async () => {
		let headers = new Headers();
		const res = await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
				dontRememberMe: true,
			},
			{
				onSuccess(context) {
					const header = context.response.headers.get("set-cookie");
					const cookies = parseSetCookieHeader(header || "");
					const signedCookie = cookies.get("better-auth.session_token")?.value;
					const dontRememberMe = cookies.get(
						"better-auth.dont_remember",
					)?.value;
					headers.set(
						"cookie",
						`better-auth.session_token=${signedCookie};better-auth.dont_remember=${dontRememberMe}`,
					);
				},
			},
		);
		if (!res.data?.session) {
			throw new Error("No session found");
		}
		const expiresAt = res.data.session.expiresAt;
		expect(new Date(expiresAt).valueOf()).toBeLessThanOrEqual(
			getDate(1000 * 60 * 60 * 24).valueOf(),
		);
		const response = await client.getSession({
			fetchOptions: {
				headers,
			},
		});

		if (!response.data?.session) {
			throw new Error("No session found");
		}
		// Check that the session wasn't update
		expect(
			new Date(response.data.session.expiresAt).valueOf(),
		).toBeLessThanOrEqual(getDate(1000 * 60 * 60 * 24).valueOf());
	});

	it("should set cookies correctly on sign in after changing config", async () => {
		const res = await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess(context) {
					const header = context.response.headers.get("set-cookie");
					const cookies = parseSetCookieHeader(header || "");
					expect(cookies.get("better-auth.session_token")).toMatchObject({
						value: expect.any(String),
						"max-age": (60 * 60 * 24 * 7).toString(),
						path: "/",
						httponly: true,
						samesite: "Lax",
					});
				},
			},
		);
		const expiresAt = new Date(res.data?.session?.expiresAt || "");
		const now = new Date();

		expect(expiresAt.getTime()).toBeGreaterThan(
			now.getTime() + 6 * 24 * 60 * 60 * 1000,
		);
	});

	it("should clear session on sign out", async () => {
		let headers = new Headers();
		const res = await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess(context) {
					const header = context.response.headers.get("set-cookie");
					const cookies = parseSetCookieHeader(header || "");
					const signedCookie = cookies.get("better-auth.session_token")?.value;
					headers.set("cookie", `better-auth.session_token=${signedCookie}`);
				},
			},
		);
		if (!res.data?.session) {
			throw new Error("No session found");
		}
		expect(res.data.session).not.toBeNull();
		await client.signOut({
			fetchOptions: {
				headers,
			},
		});
		const response = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(response.data);
	});

	it("should list sessions", async () => {
		const headers = new Headers();
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess: sessionSetter(headers),
			},
		);

		const response = await client.listSessions({
			fetchOptions: {
				headers,
			},
		});

		expect(response.data?.length).toBeGreaterThan(1);
	});

	it("should revoke session", async () => {
		const headers = new Headers();
		const headers2 = new Headers();
		const res = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			fetchOptions: {
				onSuccess: sessionSetter(headers),
			},
		});
		await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			fetchOptions: {
				onSuccess: sessionSetter(headers2),
			},
		});
		await client.revokeSession({
			fetchOptions: {
				headers,
			},
			id: res.data?.session?.id || "",
		});
		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(session.data).toBeNull();
		const revokeRes = await client.revokeSessions({
			fetchOptions: {
				headers: headers2,
			},
		});
		expect(revokeRes.data?.status).toBe(true);
	});
});

describe("session storage", async () => {
	let store = new Map<string, string>();
	const { client, signInWithTestUser, db } = await getTestInstance({
		secondaryStorage: {
			set(key, value, ttl) {
				store.set(key, value);
			},
			get(key) {
				return store.get(key) || null;
			},
			delete(key) {
				store.delete(key);
			},
		},
		rateLimit: {
			enabled: false,
		},
	});

	it("should store session in secondary storage", async () => {
		//since the instance creates a session on init, we expect the store to have 1 item
		expect(store.size).toBe(1);
		const { headers } = await signInWithTestUser();
		expect(store.size).toBe(2);
		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(session.data).toMatchObject({
			session: {
				id: expect.any(String),
				userId: expect.any(String),
				expiresAt: expect.any(String),
				ipAddress: expect.any(String),
				userAgent: expect.any(String),
			},
			user: {
				id: expect.any(String),
				name: "test",
				email: "test@test.com",
				emailVerified: false,
				image: null,
				createdAt: expect.any(String),
				updatedAt: expect.any(String),
			},
		});
	});

	it("should only store session in database if option is set", async () => {
		await signInWithTestUser();
		const sessionCount = await db.findMany<Session>({
			model: "session",
		});
		expect(sessionCount.length).toBe(0);
		const { db: db2, signInWithTestUser: signInWithTestUser2 } =
			await getTestInstance({
				session: {
					storeSessionInDatabase: false,
				},
			});
		await signInWithTestUser2();
		const sessionCount2 = await db2.findMany<Session>({
			model: "session",
		});
		expect(sessionCount2.length).toBe(2);
	});

	it("should revoke session", async () => {
		const { headers } = await signInWithTestUser();
		const session = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(session.data).not.toBeNull();
		const res = await client.revokeSession({
			fetchOptions: {
				headers,
			},
			id: session.data?.session?.id || "",
		});
		const revokedSession = await client.getSession({
			fetchOptions: {
				headers,
			},
		});
		expect(revokedSession.data).toBeNull();
	});
});
