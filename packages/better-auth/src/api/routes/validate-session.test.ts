import type { BetterAuthPlugin } from "@better-auth/core";
import { describe, expect, it, vi } from "vitest";
import { parseSetCookieHeader } from "../../cookies";
import { admin } from "../../plugins/admin";
import { multiSession } from "../../plugins/multi-session";
import { multiSessionClient } from "../../plugins/multi-session/client";
import { oneTimeToken } from "../../plugins/one-time-token";
import { getTestInstance } from "../../test-utils/test-instance";

const REJECT_HEADER = "x-test-reject-session";

/**
 * A plugin that rejects any session while the request carries the reject
 * header, or while `rejectUserIds` contains the session's user.
 */
function createGate() {
	const rejectUserIds = new Set<string>();
	const validateSession = vi.fn<
		NonNullable<BetterAuthPlugin["validateSession"]>
	>(
		async ({ session }, ctx) =>
			!ctx.headers?.has(REJECT_HEADER) && !rejectUserIds.has(session.userId),
	);
	const plugin = {
		id: "test-session-gate",
		validateSession,
	} satisfies BetterAuthPlugin;
	return { plugin, validateSession, rejectUserIds };
}

function withReject(headers: Headers) {
	const rejected = new Headers(headers);
	rejected.set(REJECT_HEADER, "1");
	return rejected;
}

describe("plugin validateSession", () => {
	it("rejects a session resolved from the database", async () => {
		const gate = createGate();
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [gate.plugin],
		});
		const { headers } = await signInWithTestUser();

		expect(await auth.api.getSession({ headers })).not.toBeNull();

		const response = await auth.api.getSession({
			headers: withReject(headers),
			asResponse: true,
		});
		expect(await response.json()).toBeNull();
		expect(response.headers.get("set-cookie")).toBeNull();
	});

	it("does not refresh or re-issue cookies for a rejected session", async () => {
		const gate = createGate();
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [gate.plugin],
			session: { updateAge: 0 },
		});
		const { headers } = await signInWithTestUser();

		const response = await auth.api.getSession({
			headers: withReject(headers),
			asResponse: true,
		});
		expect(await response.json()).toBeNull();
		expect(response.headers.get("set-cookie")).toBeNull();
	});

	it.each(["compact", "jwt", "jwe"] as const)(
		"rejects a session served from the %s cookie cache",
		async (strategy) => {
			const gate = createGate();
			const { auth, client, testUser, cookieSetter } = await getTestInstance({
				plugins: [gate.plugin],
				session: { cookieCache: { enabled: true, strategy, maxAge: 300 } },
			});
			const headers = new Headers();
			await client.signIn.email(
				{ email: testUser.email, password: testUser.password },
				{ onSuccess: cookieSetter(headers) },
			);
			expect(headers.get("cookie")).toContain("better-auth.session_data");

			expect(await auth.api.getSession({ headers })).not.toBeNull();
			const call = gate.validateSession.mock.lastCall!;
			expect(call[0].session.expiresAt).toBeInstanceOf(Date);
			expect(call[0].user.createdAt).toBeInstanceOf(Date);

			const response = await auth.api.getSession({
				headers: withReject(headers),
				asResponse: true,
			});
			expect(await response.json()).toBeNull();
			expect(response.headers.get("set-cookie")).toBeNull();
		},
	);

	it("rejects the session on endpoints that require one", async () => {
		const gate = createGate();
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [gate.plugin],
		});
		const { headers } = await signInWithTestUser();

		await expect(
			auth.api.listSessions({ headers: withReject(headers) }),
		).rejects.toMatchObject({ statusCode: 401 });
	});

	it("fails the lookup when a validator throws", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [
				{
					id: "throwing-gate",
					validateSession: () => {
						throw new Error("gate unavailable");
					},
				},
			],
		});
		const { headers } = await signInWithTestUser();

		await expect(auth.api.getSession({ headers })).rejects.toMatchObject({
			statusCode: 500,
		});
		await expect(auth.api.listSessions({ headers })).rejects.toMatchObject({
			statusCode: 401,
		});
	});

	it("signs a rejected session out of the browser without deleting it", async () => {
		const gate = createGate();
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [gate.plugin],
		});
		const { headers } = await signInWithTestUser();

		const response = await auth.api.signOut({
			headers: withReject(headers),
			asResponse: true,
		});
		expect(response.status).toBe(200);
		const cookies = parseSetCookieHeader(
			response.headers.get("set-cookie") ?? "",
		);
		expect(cookies.get("better-auth.session_token")?.value).toBe("");
		expect(await auth.api.getSession({ headers })).not.toBeNull();
	});

	it("refuses to redeem a one-time token for a rejected session", async () => {
		const gate = createGate();
		const { auth, signInWithTestUser } = await getTestInstance({
			plugins: [oneTimeToken(), gate.plugin],
		});
		const { headers } = await signInWithTestUser();
		const { token } = await auth.api.generateOneTimeToken({ headers });

		await expect(
			auth.api.verifyOneTimeToken({
				body: { token },
				headers: withReject(new Headers()),
			}),
		).rejects.toMatchObject({ statusCode: 400 });
	});

	describe("multi-session", () => {
		async function signInTwoUsers() {
			const gate = createGate();
			const instance = await getTestInstance(
				{ plugins: [multiSession(), gate.plugin] },
				{ clientOptions: { plugins: [multiSessionClient()] } },
			);
			const { client, cookieSetter, testUser } = instance;
			const headers = new Headers();
			const first = await client.signIn.email(testUser, {
				onSuccess: cookieSetter(headers),
			});
			const second = await client.signUp.email(
				{ email: "second@test.com", password: "password", name: "Second" },
				{ headers, onSuccess: cookieSetter(headers) },
			);
			return {
				...instance,
				gate,
				headers,
				firstUser: first.data!.user,
				firstToken: first.data!.token,
				secondToken: second.data!.token!,
			};
		}

		it("refuses to activate a rejected session", async () => {
			const { auth, gate, headers, firstUser, firstToken } =
				await signInTwoUsers();
			await auth.api.setActiveSession({
				body: { sessionToken: firstToken },
				headers,
			});

			gate.rejectUserIds.add(firstUser.id);
			await expect(
				auth.api.setActiveSession({
					body: { sessionToken: firstToken },
					headers,
				}),
			).rejects.toMatchObject({ statusCode: 401 });
		});

		it("omits rejected sessions from the device session list", async () => {
			const { auth, gate, headers, firstUser } = await signInTwoUsers();
			expect(await auth.api.listDeviceSessions({ headers })).toHaveLength(2);

			gate.rejectUserIds.add(firstUser.id);
			const sessions = await auth.api.listDeviceSessions({ headers });
			expect(sessions).toHaveLength(1);
			expect(sessions.map((s) => s.user.id)).not.toContain(firstUser.id);
		});

		it("refuses to revoke a rejected session", async () => {
			const { auth, gate, headers, firstUser, firstToken } =
				await signInTwoUsers();
			gate.rejectUserIds.add(firstUser.id);

			await expect(
				auth.api.revokeDeviceSession({
					body: { sessionToken: firstToken },
					headers,
				}),
			).rejects.toMatchObject({ statusCode: 401 });
			gate.rejectUserIds.clear();
			expect(await auth.api.listDeviceSessions({ headers })).toHaveLength(2);
		});

		it("does not switch to a rejected session after revoking the active one", async () => {
			const { auth, gate, headers, firstUser, secondToken } =
				await signInTwoUsers();
			gate.rejectUserIds.add(firstUser.id);

			const response = await auth.api.revokeDeviceSession({
				body: { sessionToken: secondToken },
				headers,
				asResponse: true,
			});
			expect(response.status).toBe(200);
			const cookies = parseSetCookieHeader(
				response.headers.get("set-cookie") ?? "",
			);
			expect(cookies.get("better-auth.session_token")?.value).toBe("");
		});
	});

	it("refuses to restore a rejected admin session after impersonation", async () => {
		const gate = createGate();
		const { auth, signInWithTestUser, cookieSetter } = await getTestInstance({
			plugins: [admin(), gate.plugin],
			databaseHooks: {
				user: {
					create: {
						before: async (user) => ({
							data: {
								...user,
								role: user.email === "test@test.com" ? "admin" : "user",
							},
						}),
					},
				},
			},
		});
		const { headers: adminHeaders, user: adminUser } =
			await signInWithTestUser();
		const target = await auth.api.createUser({
			body: { email: "target@test.com", password: "password123", name: "T" },
			headers: adminHeaders,
		});
		const impersonating = new Headers(adminHeaders);
		const impersonation = await auth.api.impersonateUser({
			body: { userId: target.user.id },
			headers: adminHeaders,
			asResponse: true,
		});
		cookieSetter(impersonating)({ response: impersonation });
		expect(
			(await auth.api.getSession({ headers: impersonating }))?.user.id,
		).toBe(target.user.id);

		gate.rejectUserIds.add(adminUser.id);
		await expect(
			auth.api.stopImpersonating({ headers: impersonating }),
		).rejects.toMatchObject({ statusCode: 401 });
	});
});
