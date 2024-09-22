import { describe, expect, it, vi } from "vitest";
import { getTestInstance } from "../../test-utils/test-instance";
import { parseSetCookieHeader } from "../../utils/cookies";
import { getDate } from "../../utils/date";

describe("session", async () => {
	const { client, testUser, sessionSetter } = await getTestInstance();

	it("should set cookies correctly on sign in", async () => {
		await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			fetchOptions: {
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
		});
	});

	it("should return null when not authenticated", async () => {
		const response = await client.session();
		expect(response.data).toBeNull();
	});

	it("should update session when close to expiry", async () => {
		let headers = new Headers();
		const res = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			fetchOptions: {
				onSuccess(context) {
					const header = context.response.headers.get("set-cookie");
					const cookies = parseSetCookieHeader(header || "");
					const signedCookie = cookies.get("better-auth.session_token")?.value;
					headers.set("cookie", `better-auth.session_token=${signedCookie}`);
				},
			},
		});

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
		const response = await client.session({
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
		const res = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			dontRememberMe: true,
			fetchOptions: {
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
		});
		if (!res.data?.session) {
			throw new Error("No session found");
		}
		const expiresAt = res.data.session.expiresAt;
		expect(new Date(expiresAt).valueOf()).toBeLessThanOrEqual(
			getDate(1000 * 60 * 60 * 24).valueOf(),
		);
		const response = await client.session({
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

	it("should clear session on sign out", async () => {
		let headers = new Headers();
		const res = await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			fetchOptions: {
				onSuccess(context) {
					const header = context.response.headers.get("set-cookie");
					const cookies = parseSetCookieHeader(header || "");
					const signedCookie = cookies.get("better-auth.session_token")?.value;
					headers.set("cookie", `better-auth.session_token=${signedCookie}`);
				},
			},
		});
		if (!res.data?.session) {
			throw new Error("No session found");
		}
		expect(res.data.session).not.toBeNull();
		await client.signOut({
			fetchOptions: {
				headers,
			},
		});
		const response = await client.session({
			fetchOptions: {
				headers,
			},
		});
		expect(response.data);
	});

	it("should list sessions", async () => {
		const headers = new Headers();
		await client.signIn.email({
			email: testUser.email,
			password: testUser.password,
			fetchOptions: {
				onSuccess: sessionSetter(headers),
			},
		});

		const response = await client.user.listSessions({
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
		await client.user.revokeSession({
			fetchOptions: {
				headers,
			},
			id: res.data?.session?.id || "",
		});
		const session = await client.session({
			fetchOptions: {
				headers,
			},
		});
		expect(session.data).toBeNull();
		const revokeRes = await client.user.revokeSessions({
			fetchOptions: {
				headers: headers2,
			},
		});
		expect(revokeRes.data?.status).toBe(true);
	});
});
