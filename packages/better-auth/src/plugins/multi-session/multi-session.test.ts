import { describe, expect, it } from "vitest";
import { parseSetCookieHeader } from "../../cookies";
import { getTestInstance } from "../../test-utils/test-instance";
import { multiSession } from ".";
import { multiSessionClient } from "./client";

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

	let headers = new Headers();
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
});
