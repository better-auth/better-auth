import type { BetterAuthPlugin } from "@better-auth/core";
import {
	createAuthEndpoint,
	createAuthMiddleware,
} from "@better-auth/core/api";
import { runWithRequestState } from "@better-auth/core/context";
import type { SecondaryStorage } from "@better-auth/core/db";
import { afterEach, describe, expect, it, vi } from "vitest";
import { sessionMiddleware } from "../api";
import { dispatchAuthEndpoint } from "../api/dispatch";
import { setSessionCookie } from "../cookies";
import { admin } from "../plugins/admin";
import { twoFactor } from "../plugins/two-factor";
import { getTestInstance } from "../test-utils/test-instance";
import type { BetterAuthOptions, Session } from "../types";
import { selectSessionsOverLimit } from "./session-limit";

function createSecondaryStorage(
	store = new Map<string, string>(),
): SecondaryStorage {
	return {
		set(key, value) {
			store.set(key, value);
		},
		get(key) {
			return store.get(key) || null;
		},
		getAndDelete(key) {
			const value = store.get(key) || null;
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

const storageModes: {
	name: string;
	options: () => Partial<BetterAuthOptions>;
}[] = [
	{ name: "database", options: () => ({}) },
	{
		name: "secondary storage",
		options: () => ({ secondaryStorage: createSecondaryStorage() }),
	},
	{
		name: "secondary storage with sessions stored in the database",
		options: () => ({
			secondaryStorage: createSecondaryStorage(),
			session: { storeSessionInDatabase: true },
		}),
	},
	{
		name: "secondary storage with sessions preserved in the database",
		options: () => ({
			secondaryStorage: createSecondaryStorage(),
			session: {
				storeSessionInDatabase: true,
				preserveSessionInDatabase: true,
			},
		}),
	},
];

/**
 * Rotates the current session the way plugins do after a security change:
 * creates a replacement from the current session, then deletes the old one.
 */
const rotateSessionPlugin = {
	id: "rotate-session",
	endpoints: {
		rotateSession: createAuthEndpoint(
			"/rotate-session",
			{ method: "POST", use: [sessionMiddleware] },
			async (ctx) => {
				const { session, user } = ctx.context.session;
				const newSession = await ctx.context.internalAdapter.createSession(
					user.id,
					false,
					session,
				);
				await setSessionCookie(ctx, { session: newSession, user });
				await ctx.context.internalAdapter.deleteSession(session.token);
				return ctx.json({ id: newSession.id });
			},
		),
	},
} satisfies BetterAuthPlugin;

/**
 * Creates a session and hands back only its token, without issuing it as the
 * request's session.
 */
const createTokenPlugin = {
	id: "create-token",
	endpoints: {
		createToken: createAuthEndpoint(
			"/create-token",
			{ method: "POST", use: [sessionMiddleware] },
			async (ctx) => {
				const session = await ctx.context.internalAdapter.createSession(
					ctx.context.session.user.id,
				);
				return ctx.json({ token: session.token });
			},
		),
	},
} satisfies BetterAuthPlugin;

const noopEndpoint = createAuthEndpoint(
	"/noop",
	{ method: "GET" },
	async (ctx) => ctx.json({ ok: true }),
);

/**
 * Dispatches another endpoint from a sign-in after hook, as the OAuth provider
 * plugin does to resume an authorization request.
 */
const nestedDispatchPlugin = {
	id: "nested-dispatch",
	hooks: {
		after: [
			{
				matcher: (ctx) => ctx.path === "/sign-in/email",
				handler: createAuthMiddleware(async (ctx) => {
					await dispatchAuthEndpoint(noopEndpoint, { ...ctx });
				}),
			},
		],
	},
} satisfies BetterAuthPlugin;

async function getMaxSessionsTestInstance<O extends Partial<BetterAuthOptions>>(
	maxPerUser: number,
	options: O = {} as O,
) {
	const instance = await getTestInstance({
		...options,
		session: { ...options.session, maxPerUser },
		rateLimit: { enabled: false },
	});
	const { auth, signInWithTestUser } = instance;
	const ctx = await auth.$context;

	async function signIn() {
		const { headers } = await signInWithTestUser();
		const current = await auth.api.getSession({ headers });
		if (!current) throw new Error("sign-in did not create a session");
		return { headers, ...current };
	}

	async function isActive(headers: Headers) {
		return (await auth.api.getSession({ headers })) !== null;
	}

	/**
	 * Lists through the internal adapter, since the admin plugin hides
	 * impersonation sessions from `/list-sessions`.
	 */
	async function listSessionIds(userId: string) {
		const sessions = await ctx.internalAdapter.listSessions(userId, {
			onlyActiveSessions: true,
		});
		return sessions.map((s) => s.id).sort();
	}

	return { ...instance, ctx, signIn, isActive, listSessionIds };
}

/**
 * @see https://github.com/better-auth/better-auth/issues/12342
 */
describe("session.maxPerUser", () => {
	afterEach(() => {
		vi.useRealTimers();
	});

	/**
	 * Spaces sessions apart so their creation times are distinct even on
	 * columns that store whole seconds.
	 */
	function advanceClock() {
		vi.setSystemTime(Date.now() + 2000);
	}

	/**
	 * Fakes the clock and moves past the session the test user's sign-up
	 * created.
	 */
	function useFakeClock() {
		vi.useFakeTimers({ toFake: ["Date"] });
		advanceClock();
	}

	describe.each(storageModes)("with $name", ({ options }) => {
		it("revokes the oldest sessions once the limit is exceeded", async () => {
			const { signIn, isActive, listSessionIds } =
				await getMaxSessionsTestInstance(2, options());
			useFakeClock();

			const first = await signIn();
			advanceClock();
			const second = await signIn();
			advanceClock();
			const third = await signIn();

			expect(await isActive(first.headers)).toBe(false);
			expect(await isActive(second.headers)).toBe(true);
			expect(await isActive(third.headers)).toBe(true);
			expect(await listSessionIds(third.user.id)).toEqual(
				[second.session.id, third.session.id].sort(),
			);
		});

		it("keeps the new session when the limit is 1", async () => {
			const { signIn, isActive, listSessionIds } =
				await getMaxSessionsTestInstance(1, options());
			useFakeClock();

			const first = await signIn();
			advanceClock();
			const second = await signIn();

			expect(await isActive(first.headers)).toBe(false);
			expect(await listSessionIds(second.user.id)).toEqual([second.session.id]);
		});

		it("keeps the session created at sign-up", async () => {
			const { auth, listSessionIds } = await getMaxSessionsTestInstance(
				1,
				options(),
			);

			const { user, token } = await auth.api.signUpEmail({
				body: {
					email: "new-user@test.com",
					password: "new-user-password",
					name: "New User",
				},
			});

			expect(token).toBeTruthy();
			expect(await listSessionIds(user.id)).toHaveLength(1);
		});

		it("enforces the limit for sessions created outside a request", async () => {
			const { ctx, signIn, isActive, listSessionIds } =
				await getMaxSessionsTestInstance(1, options());
			useFakeClock();

			const first = await signIn();
			advanceClock();
			const created = await ctx.internalAdapter.createSession(first.user.id);

			expect(await isActive(first.headers)).toBe(false);
			expect(await listSessionIds(first.user.id)).toEqual([created.id]);
		});

		it("does not count expired sessions", async () => {
			const { auth, testUser, signIn, isActive, listSessionIds } =
				await getMaxSessionsTestInstance(2, options());
			useFakeClock();

			const longLived = await signIn();
			advanceClock();
			// Expires after a day, while `longLived` lasts a week.
			const { token } = await auth.api.signInEmail({
				body: {
					email: testUser.email,
					password: testUser.password,
					rememberMe: false,
				},
			});
			vi.setSystemTime(Date.now() + 2 * 24 * 60 * 60 * 1000);
			const next = await signIn();

			expect(await isActive(longLived.headers)).toBe(true);
			expect(
				await isActive(new Headers({ authorization: `Bearer ${token}` })),
			).toBe(false);
			expect(await listSessionIds(next.user.id)).toEqual(
				[longLived.session.id, next.session.id].sort(),
			);
		});

		it("applies a limit larger than the database page size", async () => {
			const base = options();
			const { signIn, isActive } = await getMaxSessionsTestInstance(3, {
				...base,
				advanced: { database: { defaultFindManyLimit: 2 } },
			});
			useFakeClock();

			const sessions = [];
			for (let i = 0; i < 5; i++) {
				sessions.push(await signIn());
				advanceClock();
			}

			const active = [];
			for (const { headers } of sessions) {
				active.push(await isActive(headers));
			}
			expect(active).toEqual([false, false, true, true, true]);
		});
	});

	it("does not revoke sessions when no limit is set", async () => {
		const { auth, signInWithTestUser } = await getTestInstance({
			rateLimit: { enabled: false },
		});
		useFakeClock();

		const sessions = [];
		for (let i = 0; i < 3; i++) {
			const { headers } = await signInWithTestUser();
			sessions.push(await auth.api.getSession({ headers }));
			advanceClock();
		}

		for (const current of sessions) {
			expect(current).not.toBeNull();
		}
	});

	it("runs session delete hooks in the request that created the session", async () => {
		const deletedFrom: (string | undefined)[] = [];
		const { signIn, isActive } = await getMaxSessionsTestInstance(1, {
			databaseHooks: {
				session: {
					delete: {
						async before(_session, ctx) {
							deletedFrom.push(ctx?.path);
						},
					},
				},
			},
		});
		useFakeClock();

		const first = await signIn();
		advanceClock();
		deletedFrom.length = 0;
		await signIn();

		expect(await isActive(first.headers)).toBe(false);
		expect(deletedFrom).toEqual(["/sign-in/email"]);
	});

	it("runs session delete hooks for revocations larger than the database page size", async () => {
		let deleteHookCalls = 0;
		const { ctx, signIn, isActive, listSessionIds } =
			await getMaxSessionsTestInstance(1, {
				advanced: { database: { defaultFindManyLimit: 2 } },
				databaseHooks: {
					session: {
						delete: {
							async before() {
								deleteHookCalls++;
							},
						},
					},
				},
			});
		useFakeClock();

		// Sessions created within the same second don't revoke each other.
		const existing = await signIn();
		for (let i = 0; i < 4; i++) {
			await ctx.internalAdapter.createSession(existing.user.id);
		}

		advanceClock();
		deleteHookCalls = 0;
		const next = await signIn();

		expect(deleteHookCalls).toBe(5);
		expect(await isActive(existing.headers)).toBe(false);
		expect(await listSessionIds(next.user.id)).toEqual([next.session.id]);
	});

	it("does not revoke sessions for a new session that has already expired", async () => {
		const { ctx, signIn, isActive } = await getMaxSessionsTestInstance(1);
		useFakeClock();

		const existing = await signIn();
		advanceClock();
		await ctx.internalAdapter.createSession(
			existing.user.id,
			false,
			{ expiresAt: new Date(Date.now() - 1000) },
			true,
		);

		expect(await isActive(existing.headers)).toBe(true);
	});

	it("stops revoking when a delete hook vetoes the revocation", async () => {
		let deleteAttempts = 0;
		const { signIn, isActive } = await getMaxSessionsTestInstance(1, {
			// Small enough that every read fills the window and reads again.
			advanced: { database: { defaultFindManyLimit: 1 } },
			databaseHooks: {
				session: {
					delete: {
						async before() {
							deleteAttempts++;
							return false;
						},
					},
				},
			},
		});
		useFakeClock();

		const first = await signIn();
		advanceClock();
		deleteAttempts = 0;
		const second = await signIn();

		expect(deleteAttempts).toBe(1);
		expect(await isActive(first.headers)).toBe(true);
		expect(await isActive(second.headers)).toBe(true);
	});

	it("does not revoke sessions when a create hook deletes the new session", async () => {
		let deleteCreatedSessions = false;
		const instance = await getMaxSessionsTestInstance(1, {
			databaseHooks: {
				session: {
					create: {
						async after(session) {
							if (!deleteCreatedSessions) return;
							const ctx = await instance.auth.$context;
							await ctx.internalAdapter.deleteSession(session.token);
						},
					},
				},
			},
		});
		const { ctx, signIn, isActive, listSessionIds } = instance;
		useFakeClock();

		const existing = await signIn();
		advanceClock();
		deleteCreatedSessions = true;
		await ctx.internalAdapter.createSession(existing.user.id);

		expect(await isActive(existing.headers)).toBe(true);
		expect(await listSessionIds(existing.user.id)).toEqual([
			existing.session.id,
		]);
	});

	it.each([
		{ name: "a sign-in", plugins: () => [twoFactor()] },
		{
			name: "a sign-in with a nested dispatch",
			plugins: () => [nestedDispatchPlugin, twoFactor()],
		},
	])(
		"does not revoke sessions for $name that stops at a second factor",
		async ({ plugins }) => {
			const { auth, db, testUser, signIn, isActive, listSessionIds } =
				await getMaxSessionsTestInstance(1, { plugins: plugins() });
			useFakeClock();

			const existing = await signIn();
			await db.update({
				model: "user",
				where: [{ field: "id", value: existing.user.id }],
				update: { twoFactorEnabled: true },
			});

			advanceClock();
			const res = await auth.api.signInEmail({
				body: { email: testUser.email, password: testUser.password },
			});

			expect(res).toMatchObject({ twoFactorRedirect: true });
			expect(await isActive(existing.headers)).toBe(true);
			expect(await listSessionIds(existing.user.id)).toEqual([
				existing.session.id,
			]);
		},
	);

	it("defers the limit inside request state the caller created", async () => {
		const { auth, db, testUser, signIn, isActive } =
			await getMaxSessionsTestInstance(1, { plugins: [twoFactor()] });
		useFakeClock();

		const existing = await signIn();
		await db.update({
			model: "user",
			where: [{ field: "id", value: existing.user.id }],
			update: { twoFactorEnabled: true },
		});

		advanceClock();
		const res = await runWithRequestState(new WeakMap(), () =>
			auth.api.signInEmail({
				body: { email: testUser.email, password: testUser.password },
			}),
		);

		expect(res).toMatchObject({ twoFactorRedirect: true });
		expect(await isActive(existing.headers)).toBe(true);
	});

	it("enforces the limit for sessions created after a request finishes", async () => {
		const { auth, ctx, signIn, isActive } = await getMaxSessionsTestInstance(1);
		useFakeClock();

		const existing = await signIn();
		advanceClock();
		await runWithRequestState(new WeakMap(), async () => {
			await auth.api.getSession({ headers: existing.headers });
			await ctx.internalAdapter.createSession(existing.user.id);
		});

		expect(await isActive(existing.headers)).toBe(false);
	});

	it("does not revoke sessions when the request fails", async () => {
		let failSignIn = false;
		const { auth, testUser, signIn, isActive } =
			await getMaxSessionsTestInstance(1, {
				hooks: {
					after: createAuthMiddleware(async (ctx) => {
						if (failSignIn && ctx.path === "/sign-in/email") {
							throw new Error("sign-in failed");
						}
					}),
				},
			});
		useFakeClock();

		const existing = await signIn();
		advanceClock();
		failSignIn = true;
		await expect(
			auth.api.signInEmail({
				body: { email: testUser.email, password: testUser.password },
			}),
		).rejects.toThrow("sign-in failed");

		expect(await isActive(existing.headers)).toBe(true);
	});

	it("enforces the limit for sessions an endpoint creates without issuing", async () => {
		const { auth, ctx, signIn, isActive, listSessionIds } =
			await getMaxSessionsTestInstance(1, { plugins: [createTokenPlugin] });
		useFakeClock();

		const existing = await signIn();
		advanceClock();
		const { token } = await auth.api.createToken({
			headers: existing.headers,
		});

		expect(await isActive(existing.headers)).toBe(false);
		const sessions = await listSessionIds(existing.user.id);
		expect(sessions).toHaveLength(1);
		expect((await ctx.internalAdapter.findSession(token))?.session.id).toBe(
			sessions[0],
		);
	});

	it("does not revoke other sessions when a session is rotated", async () => {
		const { auth, signIn, isActive, listSessionIds } =
			await getMaxSessionsTestInstance(2, { plugins: [rotateSessionPlugin] });
		useFakeClock();

		const laptop = await signIn();
		advanceClock();
		const phone = await signIn();

		advanceClock();
		const { id: rotatedId } = await auth.api.rotateSession({
			headers: phone.headers,
		});

		expect(await isActive(laptop.headers)).toBe(true);
		expect(await listSessionIds(laptop.user.id)).toEqual(
			[laptop.session.id, rotatedId].sort(),
		);
	});

	it("drops revoked sessions from the secondary storage session list", async () => {
		const store = new Map<string, string>();
		const { signIn } = await getMaxSessionsTestInstance(1, {
			secondaryStorage: createSecondaryStorage(store),
		});
		useFakeClock();

		let latest = await signIn();
		for (let i = 0; i < 3; i++) {
			advanceClock();
			latest = await signIn();
		}

		const list = JSON.parse(
			store.get(`active-sessions-${latest.user.id}`) ?? "[]",
		) as { token: string }[];
		expect(list.map((s) => s.token)).toEqual([latest.session.token]);
	});

	it("revokes sessions without a valid creation time first", () => {
		const now = Date.now();
		const at = (token: string, createdAt: Date | string | undefined) =>
			({ token, createdAt }) as Session;

		expect(
			selectSessionsOverLimit(
				at("new", new Date(now)),
				[
					at("missing", undefined),
					at("old", new Date(now - 10_000)),
					at("invalid", "not a date"),
					at("recent", new Date(now - 5000)),
				],
				2,
			),
		).toEqual(["old", "missing", "invalid"]);
	});

	it("does not let concurrent sign-ins revoke each other", async () => {
		const { signIn, isActive, listSessionIds } =
			await getMaxSessionsTestInstance(1);
		useFakeClock();

		const [a, b] = await Promise.all([signIn(), signIn()]);

		expect(await isActive(a.headers)).toBe(true);
		expect(await isActive(b.headers)).toBe(true);

		// The next sign-in brings the user back within the limit.
		advanceClock();
		const next = await signIn();
		expect(await listSessionIds(next.user.id)).toEqual([next.session.id]);
	});

	it("does not count or revoke impersonation sessions", async () => {
		const { auth, ctx, db, signIn, signInWithUser, isActive, listSessionIds } =
			await getMaxSessionsTestInstance(1, { plugins: [admin()] });
		useFakeClock();

		const adminEmail = "admin@test.com";
		const adminPassword = "admin-password";
		const { user: adminUser } = await auth.api.signUpEmail({
			body: { email: adminEmail, password: adminPassword, name: "Admin" },
		});
		await db.update({
			model: "user",
			where: [{ field: "id", value: adminUser.id }],
			update: { role: "admin" },
		});
		const { headers: adminHeaders } = await signInWithUser(
			adminEmail,
			adminPassword,
		);

		advanceClock();
		const own = await signIn();

		// Impersonating the user revokes none of the user's own sessions.
		advanceClock();
		const impersonation = await auth.api.impersonateUser({
			body: { userId: own.user.id },
			headers: adminHeaders,
		});
		const stored = await ctx.internalAdapter.findSession(
			impersonation.session.token,
		);
		expect(stored?.session.impersonatedBy).toBe(adminUser.id);
		expect(await isActive(own.headers)).toBe(true);

		// A new session of the user's own revokes the older one, but the
		// impersonation session neither counts nor gets revoked.
		advanceClock();
		const next = await signIn();
		expect(await isActive(own.headers)).toBe(false);
		expect(await listSessionIds(own.user.id)).toEqual(
			[next.session.id, impersonation.session.id].sort(),
		);
	});
});
