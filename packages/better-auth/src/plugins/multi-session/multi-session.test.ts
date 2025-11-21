import { describe, expect, it } from "vitest";
import { parseCookies } from "../../cookies";
import { getTestInstance } from "../../test-utils/test-instance";
import { multiSession } from ".";
import { multiSessionClient } from "./client";

const DEVICE_ID_COOKIE_NAME = "better-auth.device_id";

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

	it("should set device_id cookie on sign in", async () => {
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess: cookieSetter(headers),
			},
		);
		expect(headers.get("cookie")).contains(DEVICE_ID_COOKIE_NAME);
		expect(headers.get("cookie")).contains("better-auth.session_token");
	});

	it("should allow second session with same device_id", async () => {
		const firstDeviceId = parseCookies(headers.get("cookie") || "").get(
			DEVICE_ID_COOKIE_NAME,
		);
		const firstSessionToken = parseCookies(headers.get("cookie") || "").get(
			"better-auth.session_token",
		);
		await client.signUp.email(testUser2, {
			headers,
			onSuccess: cookieSetter(headers),
		});
		const secondDeviceId = parseCookies(headers.get("cookie") || "").get(
			DEVICE_ID_COOKIE_NAME,
		);
		const secondSessionToken = parseCookies(headers.get("cookie") || "").get(
			"better-auth.session_token",
		);
		expect(secondDeviceId).toBe(firstDeviceId); // Should not change
		expect(secondSessionToken).not.toBe(firstSessionToken); // Should change
	});

	it("should list all device sessions", async () => {
		const res = await client.multiSession.listDeviceSessions({
			fetchOptions: {
				headers: new Headers(headers),
			},
		});
		expect(res.data).toHaveLength(2);
		const emails = res.data?.map((s) => s.user.email);
		expect(emails).toContain(testUser.email);
		expect(emails).toContain(testUser2.email);
	});

	it("should set active session", async () => {
		const res = await client.multiSession.listDeviceSessions({
			fetchOptions: { headers: new Headers(headers) },
		});
		const firstUserSession = res.data?.find(
			(s) => s.user.email === testUser.email,
		);
		expect(firstUserSession).toBeDefined();
		await client.multiSession.setActive({
			sessionToken: firstUserSession!.session.token,
			fetchOptions: {
				headers: new Headers(headers),
				onSuccess: cookieSetter(headers),
			},
		});
		const session = await client.getSession({
			fetchOptions: { headers: new Headers(headers) },
		});
		expect(session.data?.user.email).toBe(testUser.email);
	});

	it("should enforce maximum sessions limit", async () => {
		const testUser3 = {
			email: "third@test.com",
			password: "password",
			name: "Third",
		};

		await client.signUp.email(testUser3, {
			headers: new Headers(headers),
			onSuccess: cookieSetter(headers),
		});

		const res = await client.multiSession.listDeviceSessions({
			fetchOptions: { headers: new Headers(headers) },
		});
		expect(res.data).toHaveLength(2);
		const emails = res.data?.map((s) => s.user.email);
		expect(emails).toContain(testUser3.email);
		expect(emails).not.toContain(testUser.email);
		expect(emails).toContain(testUser2.email);
	});

	it("should revoke a session", async () => {
		const res = await client.multiSession.listDeviceSessions({
			fetchOptions: { headers: new Headers(headers) },
		});
		const sessionToRevoke = res.data![0]; // Revoke first available

		await client.multiSession.revoke(
			{
				sessionToken: sessionToRevoke?.session.token || "",
			},
			{
				headers: new Headers(headers),
				onSuccess: cookieSetter(headers),
			},
		);

		const resAfter = await client.multiSession.listDeviceSessions({
			fetchOptions: { headers: new Headers(headers) },
		});
		expect(resAfter.data).toHaveLength(1);
		expect(
			resAfter.data?.find(
				(s) => s.session.token === sessionToRevoke?.session.token,
			),
		).toBeUndefined();
	});
});
