import { APIError } from "better-auth/api";
import { parseSetCookieHeader } from "better-auth/cookies";
import { getTestInstance } from "better-auth/test";
import { describe, expect, it, vi } from "vitest";
import { refreshableSession } from "../src";
import { refreshableSessionClient } from "../src/client";

const CLIENT_ID = "test-native-client";
const ACCESS_HEADER = "x-test-session-token";
const REFRESH_HEADER = "x-test-refresh-token";

function cookieHeaderFromResponse(headers: Headers): string {
	return Array.from(
		parseSetCookieHeader(headers.get("set-cookie") ?? "").entries(),
	)
		.filter(([, cookie]) => cookie["max-age"] !== 0)
		.map(([name, cookie]) => `${name}=${encodeURIComponent(cookie.value)}`)
		.join("; ");
}

function getCookie(headers: Headers, suffix: string): string | undefined {
	const cookies = parseSetCookieHeader(headers.get("set-cookie") ?? "");
	return Array.from(cookies.entries()).find(([name]) =>
		name.endsWith(suffix),
	)?.[1].value;
}

describe("refreshable-session", async () => {
	const { auth, client, testUser } = await getTestInstance(
		{
			session: {
				expiresIn: 60,
				additionalFields: {
					activeAccountId: {
						type: "string",
						required: false,
					},
				},
			},
			plugins: [
				refreshableSession({
					refreshTokenExpiresIn: 60 * 60,
					refreshTokenReuseInterval: 30,
					browser: {
						enabled: true,
						disableSessionRefresh: true,
					},
					nativeClients: [
						{
							clientId: CLIENT_ID,
							accessTokenExpiresIn: 30,
							accessTokenHeader: ACCESS_HEADER,
							refreshTokenHeader: REFRESH_HEADER,
						},
					],
				}),
			],
		},
		{
			clientOptions: {
				plugins: [refreshableSessionClient()],
			},
		},
	);

	it("recovers an expired browser session during get-session", async () => {
		let signInHeaders = new Headers();
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess(context) {
					signInHeaders = context.response.headers;
				},
			},
		);

		const sessionCookie = getCookie(signInHeaders, "session_token");
		const refreshCookie = getCookie(signInHeaders, "refresh_token");
		expect(sessionCookie).toBeDefined();
		expect(refreshCookie).toBeDefined();

		const rawSessionToken = sessionCookie!.split(".")[0]!;
		const context = await auth.$context;
		const originalSession =
			await context.internalAdapter.findSession(rawSessionToken);
		const originalCreatedAt = originalSession!.session.createdAt.getTime();
		await context.internalAdapter.updateSession(rawSessionToken, {
			expiresAt: new Date(Date.now() - 1_000),
		});
		expect(
			(
				await context.internalAdapter.findSession(rawSessionToken)
			)?.session.expiresAt.getTime(),
		).toBeLessThan(Date.now());

		const response = await auth.handler(
			new Request("http://localhost:3000/api/auth/get-session", {
				headers: {
					cookie: cookieHeaderFromResponse(signInHeaders),
				},
			}),
		);
		const session = (await response.json()) as {
			session: { createdAt: string };
			user: { email: string };
		};
		expect(response.status).toBe(200);
		expect(session.user.email).toBe(testUser.email);
		expect(new Date(session.session.createdAt).getTime()).toBe(
			originalCreatedAt,
		);
		expect(getCookie(response.headers, "refresh_token")).toBeDefined();
		expect(getCookie(response.headers, "refresh_token")).not.toBe(
			refreshCookie,
		);
	});

	it("keeps the browser session token out of explicit refresh responses", async () => {
		let signInHeaders = new Headers();
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess(context) {
					signInHeaders = context.response.headers;
				},
			},
		);

		let refreshHeaders = new Headers();
		const refresh = await client.refreshSession(
			{},
			{
				headers: { cookie: cookieHeaderFromResponse(signInHeaders) },
				onSuccess(context) {
					refreshHeaders = context.response.headers;
				},
			},
		);

		expect(refresh.error).toBeNull();
		expect(refresh.data?.session).not.toHaveProperty("token");
		expect(getCookie(refreshHeaders, "session_token")).toBeDefined();
	});

	it("preserves a browser refresh credential after an operational error", async () => {
		let signInHeaders = new Headers();
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess(context) {
					signInHeaders = context.response.headers;
				},
			},
		);

		const context = await auth.$context;
		const rawSessionToken = getCookie(signInHeaders, "session_token")!.split(
			".",
		)[0]!;
		await context.internalAdapter.updateSession(rawSessionToken, {
			expiresAt: new Date(Date.now() - 1_000),
		});
		const findUser = vi
			.spyOn(context.internalAdapter, "findUserById")
			.mockRejectedValueOnce(
				APIError.from("INTERNAL_SERVER_ERROR", {
					code: "TRANSIENT_BACKEND_FAILURE",
					message: "Transient backend failure",
				}),
			);
		const cookie = cookieHeaderFromResponse(signInHeaders);

		const response = await auth.handler(
			new Request("http://localhost:3000/api/auth/get-session", {
				headers: { cookie },
			}),
		);

		expect(response.status).toBe(500);
		expect(getCookie(response.headers, "refresh_token")).toBeUndefined();
		findUser.mockRestore();

		const retry = await client.refreshSession({}, { headers: { cookie } });
		expect(retry.error).toBeNull();
	});

	it("issues native tokens and returns the same pair for a rotation retry", async () => {
		let signInHeaders = new Headers();
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				headers: { "x-better-auth-client-id": CLIENT_ID },
				onSuccess(context) {
					signInHeaders = context.response.headers;
				},
			},
		);

		const accessToken = signInHeaders.get("set-auth-token");
		const refreshToken = signInHeaders.get("set-refresh-token");
		expect(accessToken).toBeTruthy();
		expect(refreshToken).toBeTruthy();
		expect(getCookie(signInHeaders, "session_token")).toBe("");

		const session = await client.getSession({
			fetchOptions: { headers: { [ACCESS_HEADER]: accessToken! } },
		});
		expect(session.data?.user.email).toBe(testUser.email);

		let firstRefreshHeaders = new Headers();
		const firstRefresh = await client.refreshSession(
			{ refreshToken: refreshToken!, clientId: CLIENT_ID },
			{
				onSuccess(context) {
					firstRefreshHeaders = context.response.headers;
				},
			},
		);
		expect(firstRefresh.error).toBeNull();

		let retryHeaders = new Headers();
		const retry = await client.refreshSession(
			{ refreshToken: refreshToken!, clientId: CLIENT_ID },
			{
				onSuccess(context) {
					retryHeaders = context.response.headers;
				},
			},
		);
		expect(retry.error).toBeNull();
		expect(retryHeaders.get("set-auth-token")).toBe(
			firstRefreshHeaders.get("set-auth-token"),
		);
		expect(retryHeaders.get("set-refresh-token")).toBe(
			firstRefreshHeaders.get("set-refresh-token"),
		);
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10495#discussion_r3637905873
	 */
	it("keeps native refresh valid after checking an expired access session", async () => {
		let signInHeaders = new Headers();
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				headers: { "x-better-auth-client-id": CLIENT_ID },
				onSuccess(context) {
					signInHeaders = context.response.headers;
				},
			},
		);

		const accessToken = signInHeaders.get("set-auth-token")!;
		const refreshToken = signInHeaders.get("set-refresh-token")!;
		const rawSessionToken = decodeURIComponent(accessToken).split(".")[0]!;
		const context = await auth.$context;
		await context.internalAdapter.updateSession(rawSessionToken, {
			expiresAt: new Date(Date.now() - 1_000),
		});

		const expiredSession = await client.getSession({
			fetchOptions: { headers: { [ACCESS_HEADER]: accessToken } },
		});
		expect(expiredSession.data).toBeNull();
		expect(expiredSession.error).toBeNull();

		const refresh = await client.refreshSession({
			refreshToken,
			clientId: CLIENT_ID,
		});
		expect(refresh.error).toBeNull();
		expect(refresh.data?.user.email).toBe(testUser.email);
		expect(
			await context.internalAdapter.findSession(rawSessionToken),
		).toBeNull();
	});

	/**
	 * @see https://github.com/better-auth/better-auth/pull/10495#discussion_r3637905879
	 */
	it("preserves session-scoped fields when rotating", async () => {
		let signInHeaders = new Headers();
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				headers: { "x-better-auth-client-id": CLIENT_ID },
				onSuccess(context) {
					signInHeaders = context.response.headers;
				},
			},
		);

		const accessToken = signInHeaders.get("set-auth-token")!;
		const refreshToken = signInHeaders.get("set-refresh-token")!;
		const rawSessionToken = decodeURIComponent(accessToken).split(".")[0]!;
		const context = await auth.$context;
		await context.internalAdapter.updateSession(rawSessionToken, {
			activeAccountId: "account-123",
		});

		let refreshHeaders = new Headers();
		const refresh = await client.refreshSession(
			{ refreshToken, clientId: CLIENT_ID },
			{
				onSuccess(result) {
					refreshHeaders = result.response.headers;
				},
			},
		);
		expect(refresh.error).toBeNull();

		const nextAccessToken = refreshHeaders.get("set-auth-token")!;
		const nextRawSessionToken =
			decodeURIComponent(nextAccessToken).split(".")[0]!;
		const nextSession =
			await context.internalAdapter.findSession(nextRawSessionToken);
		expect(nextSession?.session.activeAccountId).toBe("account-123");
	});

	it("does not issue a refresh credential when rememberMe is false", async () => {
		let responseHeaders = new Headers();
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
				rememberMe: false,
			},
			{
				onSuccess(context) {
					responseHeaders = context.response.headers;
				},
			},
		);

		expect(getCookie(responseHeaders, "refresh_token")).toBeUndefined();
		expect(responseHeaders.get("set-refresh-token")).toBeNull();
	});

	it("issues only a short-lived native access token when rememberMe is false", async () => {
		let responseHeaders = new Headers();
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
				rememberMe: false,
			},
			{
				headers: { "x-better-auth-client-id": CLIENT_ID },
				onSuccess(context) {
					responseHeaders = context.response.headers;
				},
			},
		);

		expect(responseHeaders.get("set-auth-token")).toBeTruthy();
		expect(responseHeaders.get("set-auth-token-expires-at")).toBeTruthy();
		expect(responseHeaders.get("set-refresh-token")).toBeNull();
		expect(getCookie(responseHeaders, "session_token")).toBe("");
		expect(getCookie(responseHeaders, "dont_remember")).toBe("");
	});

	it("clears a stale browser refresh cookie after revocation", async () => {
		let signInHeaders = new Headers();
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess(context) {
					signInHeaders = context.response.headers;
				},
			},
		);
		const cookie = cookieHeaderFromResponse(signInHeaders);
		const revoke = await client.revokeRefreshSession(
			{},
			{ headers: { cookie } },
		);
		expect(revoke.error).toBeNull();

		const response = await auth.handler(
			new Request("http://localhost:3000/api/auth/get-session", {
				headers: { cookie },
			}),
		);

		expect(await response.json()).toBeNull();
		expect(getCookie(response.headers, "refresh_token")).toBe("");
	});

	it("revokes the refresh family when its Better Auth session is deleted", async () => {
		let signInHeaders = new Headers();
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				headers: { "x-better-auth-client-id": CLIENT_ID },
				onSuccess(context) {
					signInHeaders = context.response.headers;
				},
			},
		);
		const accessToken = signInHeaders.get("set-auth-token")!;
		const refreshToken = signInHeaders.get("set-refresh-token")!;
		const rawSessionToken = decodeURIComponent(accessToken).split(".")[0]!;

		const context = await auth.$context;
		await context.internalAdapter.deleteSession(rawSessionToken);
		const refresh = await client.refreshSession({
			refreshToken,
			clientId: CLIENT_ID,
		});

		expect(refresh.data).toBeNull();
		expect(refresh.error?.status).toBe(401);
	});

	it("revokes a replacement session created during family revocation", async () => {
		let signInHeaders = new Headers();
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				headers: { "x-better-auth-client-id": CLIENT_ID },
				onSuccess(context) {
					signInHeaders = context.response.headers;
				},
			},
		);
		const refreshToken = signInHeaders.get("set-refresh-token")!;
		const context = await auth.$context;
		const originalUpdateMany = context.adapter.updateMany.bind(context.adapter);
		let releaseRevocation!: () => void;
		let revocationReached!: () => void;
		const waitForRelease = new Promise<void>((resolve) => {
			releaseRevocation = resolve;
		});
		const waitForRevocation = new Promise<void>((resolve) => {
			revocationReached = resolve;
		});
		let pauseNextFamilyRevocation = true;
		const updateMany = vi
			.spyOn(context.adapter, "updateMany")
			.mockImplementation(async (args) => {
				if (
					pauseNextFamilyRevocation &&
					args.model === "refreshableSession" &&
					"revokedAt" in args.update
				) {
					pauseNextFamilyRevocation = false;
					revocationReached();
					await waitForRelease;
				}
				return originalUpdateMany(args);
			});

		const revocation = client.revokeRefreshSession({
			refreshToken,
			clientId: CLIENT_ID,
		});
		await waitForRevocation;

		let refreshHeaders = new Headers();
		const refresh = await client.refreshSession(
			{ refreshToken, clientId: CLIENT_ID },
			{
				onSuccess(result) {
					refreshHeaders = result.response.headers;
				},
			},
		);
		expect(refresh.error).toBeNull();

		releaseRevocation();
		expect((await revocation).error).toBeNull();
		updateMany.mockRestore();

		const accessToken = refreshHeaders.get("set-auth-token")!;
		const session = await client.getSession({
			fetchOptions: { headers: { [ACCESS_HEADER]: accessToken } },
		});
		expect(session.data).toBeNull();
	});

	it("rejects an unknown native client before issuing credentials", async () => {
		const response = await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				headers: { "x-better-auth-client-id": "unknown-client" },
			},
		);

		expect(response.data).toBeNull();
		expect(response.error?.status).toBe(401);
	});
});

describe("refreshable-session native-only defaults", async () => {
	const { auth, client, testUser } = await getTestInstance(
		{
			session: {
				expiresIn: 60 * 60,
				updateAge: 0,
			},
			plugins: [
				refreshableSession({
					refreshTokenExpiresIn: 60 * 60 * 24 * 90,
					nativeClients: [
						{
							clientId: CLIENT_ID,
							accessTokenExpiresIn: 30,
							accessTokenHeader: ACCESS_HEADER,
						},
					],
				}),
			],
		},
		{
			clientOptions: { plugins: [refreshableSessionClient()] },
		},
	);

	it("leaves existing browser session behavior unchanged by default", async () => {
		let signInHeaders = new Headers();
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				onSuccess(context) {
					signInHeaders = context.response.headers;
				},
			},
		);

		expect(getCookie(signInHeaders, "session_token")).toBeDefined();
		expect(getCookie(signInHeaders, "refresh_token")).toBeUndefined();
		const context = await auth.$context;

		const rawSessionToken = getCookie(signInHeaders, "session_token")!.split(
			".",
		)[0]!;
		await context.internalAdapter.updateSession(rawSessionToken, {
			expiresAt: new Date(Date.now() + 60_000),
		});

		const response = await auth.handler(
			new Request("http://localhost:3000/api/auth/get-session", {
				headers: { cookie: cookieHeaderFromResponse(signInHeaders) },
			}),
		);
		const refreshed =
			await context.internalAdapter.findSession(rawSessionToken);

		expect(response.status).toBe(200);
		expect(refreshed!.session.expiresAt.getTime()).toBeGreaterThan(
			Date.now() + 55 * 60 * 1000,
		);
		expect(getCookie(response.headers, "refresh_token")).toBeUndefined();
	});

	it("applies a separate short lifetime only to configured native clients", async () => {
		let signInHeaders = new Headers();
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				headers: { "x-better-auth-client-id": CLIENT_ID },
				onSuccess(context) {
					signInHeaders = context.response.headers;
				},
			},
		);

		const accessToken = signInHeaders.get("set-auth-token")!;
		const rawSessionToken = decodeURIComponent(accessToken).split(".")[0]!;
		const context = await auth.$context;
		const beforeGetSession =
			await context.internalAdapter.findSession(rawSessionToken);

		expect(signInHeaders.get("set-refresh-token")).toBeTruthy();
		expect(beforeGetSession!.session.expiresAt.getTime()).toBeLessThanOrEqual(
			Date.now() + 31_000,
		);

		const session = await client.getSession({
			fetchOptions: { headers: { [ACCESS_HEADER]: accessToken } },
		});
		const afterGetSession =
			await context.internalAdapter.findSession(rawSessionToken);

		expect(session.error).toBeNull();
		expect(afterGetSession!.session.expiresAt.getTime()).toBe(
			beforeGetSession!.session.expiresAt.getTime(),
		);
	});
});

describe("refreshable-session replay", async () => {
	const { client, testUser } = await getTestInstance(
		{
			plugins: [
				refreshableSession({
					refreshTokenReuseInterval: 0,
					nativeClients: [{ clientId: CLIENT_ID }],
				}),
			],
		},
		{
			clientOptions: { plugins: [refreshableSessionClient()] },
		},
	);

	it("revokes a token family when a rotated token is replayed", async () => {
		let signInHeaders = new Headers();
		await client.signIn.email(
			{
				email: testUser.email,
				password: testUser.password,
			},
			{
				headers: { "x-better-auth-client-id": CLIENT_ID },
				onSuccess(context) {
					signInHeaders = context.response.headers;
				},
			},
		);
		const refreshToken = signInHeaders.get("set-refresh-token")!;

		const first = await client.refreshSession({
			refreshToken,
			clientId: CLIENT_ID,
		});
		expect(first.error).toBeNull();

		const replay = await client.refreshSession({
			refreshToken,
			clientId: CLIENT_ID,
		});
		expect(replay.data).toBeNull();
		expect(replay.error?.status).toBe(401);
	});
});

/**
 * @see https://github.com/better-auth/better-auth/pull/10495#discussion_r3637905882
 */
describe("refreshable-session option validation", () => {
	it.each([
		[
			"default refresh lifetime",
			() =>
				refreshableSession({
					refreshTokenExpiresIn: Number.NaN,
				}),
		],
		[
			"reuse interval",
			() =>
				refreshableSession({
					refreshTokenReuseInterval: Number.POSITIVE_INFINITY,
				}),
		],
		[
			"native access lifetime",
			() =>
				refreshableSession({
					nativeClients: [
						{
							clientId: CLIENT_ID,
							accessTokenExpiresIn: Number.POSITIVE_INFINITY,
						},
					],
				}),
		],
		[
			"native refresh lifetime",
			() =>
				refreshableSession({
					nativeClients: [
						{
							clientId: CLIENT_ID,
							refreshTokenExpiresIn: Number.NaN,
						},
					],
				}),
		],
		[
			"browser refresh lifetime",
			() =>
				refreshableSession({
					browser: {
						enabled: true,
						refreshTokenExpiresIn: Number.POSITIVE_INFINITY,
					},
				}),
		],
	])("rejects a non-finite %s", (_name, createPlugin) => {
		expect(createPlugin).toThrow();
	});
});
