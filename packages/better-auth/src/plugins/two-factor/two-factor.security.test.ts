import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import type { SecondaryStorage } from "@better-auth/core/db";
import { createOTP } from "@better-auth/utils/otp";
import { describe, expect, it, vi } from "vitest";
import { symmetricDecrypt } from "../../crypto";
import { convertSetCookieToCookie } from "../../test-utils/headers";
import { getTestInstance } from "../../test-utils/test-instance";
import type { Session, User, Verification } from "../../types";
import { DEFAULT_SECRET } from "../../utils/constants";
import { phoneNumber } from "../phone-number";
import { username } from "../username";
import { TWO_FACTOR_ERROR_CODES, twoFactor } from ".";
import type { TwoFactorTable, UserWithTwoFactor } from "./types";

/**
 * Regression coverage for the duplicate `Set-Cookie` leak on a 2FA-required
 * credential sign-in.
 *
 * Prior to the fix in `cookies/expireCookie`, the credential handler wrote
 * valid `session_token` / `session_data` cookies into the response and the
 * two-factor after-hook only appended expiring overrides on top. A browser
 * would honor the expiring entries, but an attacker reading the raw response
 * could capture the valid signed values and (with `session.cookieCache.enabled`)
 * replay them to bypass the 2FA gate entirely — including calling
 * `/two-factor/disable` to permanently remove 2FA.
 *
 * These tests deliberately use `headers.getSetCookie()` instead of the
 * `parseSetCookieHeader` helper, because that helper's `Map.set(name, ...)`
 * silently drops duplicates and hides the leak.
 *
 * The 2FA after-hook matcher covers `/sign-in/email`, `/sign-in/username` and
 * `/sign-in/phone-number`; we parameterize over all three to pin the fix
 * against every entry point that triggers it.
 *
 * @see https://github.com/better-auth/better-auth/security/advisories
 */

function extractSetCookies(res: Response): string[] {
	return res.headers.getSetCookie();
}

function buildCookieHeader(entries: string[], names: string[]): Headers {
	const headers = new Headers();
	const parts = entries
		.filter((entry) => names.some((n) => entry.startsWith(`${n}=`)))
		.filter((entry) => {
			const firstSegment = entry.split(";")[0] ?? "";
			const eq = firstSegment.indexOf("=");
			return eq > 0 && firstSegment.slice(eq + 1).length > 0;
		})
		.map((entry) => entry.split(";")[0]!);
	headers.set("cookie", parts.join("; "));
	return headers;
}

function getCookieValue(entry: string): string {
	const firstSegment = entry.split(";")[0] ?? "";
	const eq = firstSegment.indexOf("=");
	return eq > 0 ? firstSegment.slice(eq + 1) : "";
}

describe("two-factor security: sign-in does not leak session cookies (cookieCache enabled)", async () => {
	const TEST_USERNAME = "security_user";
	const TEST_PHONE = "+15551230000";
	const newSessionProbe = {
		id: "new-session-probe",
		hooks: {
			after: [
				{
					matcher: (ctx) => ctx.path?.startsWith("/sign-in/") === true,
					handler: createAuthMiddleware(async (ctx) => {
						if (ctx.context.newSession) {
							ctx.setHeader("x-new-session-visible", "true");
						}
					}),
				},
			],
		},
	} satisfies BetterAuthPlugin;

	const { auth, signInWithTestUser, testUser, db } = await getTestInstance({
		secret: DEFAULT_SECRET,
		session: { cookieCache: { enabled: true } },
		plugins: [
			twoFactor(),
			username(),
			phoneNumber({
				sendOTP: async () => {
					/* not exercised */
				},
			}),
			newSessionProbe,
		],
	});

	const { headers } = await signInWithTestUser();
	const dbUser = await db.findOne<User>({
		model: "user",
		where: [{ field: "email", value: testUser.email }],
	});
	const userId = dbUser?.id as string;
	await db.update({
		model: "user",
		where: [{ field: "id", value: userId }],
		update: {
			username: TEST_USERNAME,
			displayUsername: TEST_USERNAME,
			phoneNumber: TEST_PHONE,
			phoneNumberVerified: true,
		},
	});

	const enrollment = await auth.api.enableTwoFactor({
		body: { password: testUser.password },
		headers,
	});
	if (enrollment.method !== "totp") {
		throw new Error("expected totp enrollment");
	}
	const row = await db.findOne<TwoFactorTable>({
		model: "twoFactor",
		where: [{ field: "userId", value: userId }],
	});
	const secret = await symmetricDecrypt({
		key: DEFAULT_SECRET,
		data: row!.secret,
	});
	const totpCode = await createOTP(secret).totp();
	await auth.api.verifyTOTP({ body: { code: totpCode }, headers });
	const verified = await db.findOne<UserWithTwoFactor>({
		model: "user",
		where: [{ field: "id", value: userId }],
	});
	if (!verified?.twoFactorEnabled) {
		throw new Error("failed to enable 2FA for test user");
	}

	const cases = [
		{
			path: "/sign-in/email",
			call: () =>
				auth.api.signInEmail({
					body: { email: testUser.email, password: testUser.password },
					asResponse: true,
				}),
		},
		{
			path: "/sign-in/username",
			call: () =>
				auth.api.signInUsername({
					body: { username: TEST_USERNAME, password: testUser.password },
					asResponse: true,
				}),
		},
		{
			path: "/sign-in/phone-number",
			call: () =>
				auth.api.signInPhoneNumber({
					body: { phoneNumber: TEST_PHONE, password: testUser.password },
					asResponse: true,
				}),
		},
	];

	it.each(
		cases,
	)("$path: response carries no valid signed session_token or session_data", async ({
		call,
	}) => {
		const res = await call();
		expect(res.status).toBe(200);
		expect(res.headers.get("x-new-session-visible")).toBeNull();

		const setCookies = extractSetCookies(res);
		expect(setCookies.length).toBeGreaterThan(0);

		const sessionEntries = setCookies.filter(
			(entry) =>
				entry.startsWith("better-auth.session_token=") ||
				entry.startsWith("better-auth.session_data=") ||
				entry.startsWith("better-auth.session_data."),
		);

		for (const entry of sessionEntries) {
			expect(getCookieValue(entry)).toBe("");
		}

		const twoFactorEntry = setCookies.find((entry) =>
			entry.startsWith("better-auth.two_factor="),
		);
		expect(twoFactorEntry).toBeDefined();
	});

	it.each(
		cases,
	)("$path: replaying captured cookies cannot authenticate or disable 2FA", async ({
		call,
	}) => {
		const res = await call();
		const setCookies = extractSetCookies(res);
		const replay = buildCookieHeader(setCookies, [
			"better-auth.session_token",
			"better-auth.session_data",
		]);

		const session = await auth.api.getSession({ headers: replay });
		expect(session).toBeNull();

		const disableRes = await auth.api.disableTwoFactor({
			body: { password: testUser.password },
			headers: replay,
			asResponse: true,
		});
		expect(disableRes.status).toBe(401);
	});
});

describe("two-factor security: sign-in does not leak session cookies (cookieCache disabled)", async () => {
	const { auth, signInWithTestUser, testUser, db } = await getTestInstance({
		secret: DEFAULT_SECRET,
		plugins: [twoFactor()],
	});

	const { headers } = await signInWithTestUser();
	const enrollment = await auth.api.enableTwoFactor({
		body: { password: testUser.password },
		headers,
	});
	if (enrollment.method !== "totp") {
		throw new Error("expected totp enrollment");
	}
	const dbUser = await db.findOne<User>({
		model: "user",
		where: [{ field: "email", value: testUser.email }],
	});
	const userId = dbUser?.id as string;
	const row = await db.findOne<TwoFactorTable>({
		model: "twoFactor",
		where: [{ field: "userId", value: userId }],
	});
	const secret = await symmetricDecrypt({
		key: DEFAULT_SECRET,
		data: row!.secret,
	});
	const totpCode = await createOTP(secret).totp();
	await auth.api.verifyTOTP({ body: { code: totpCode }, headers });
	const verified = await db.findOne<UserWithTwoFactor>({
		model: "user",
		where: [{ field: "id", value: userId }],
	});
	if (!verified?.twoFactorEnabled) {
		throw new Error("failed to enable 2FA for test user");
	}

	it("response carries no valid signed session_token on 2FA-required sign-in", async () => {
		const res = await auth.api.signInEmail({
			body: { email: testUser.email, password: testUser.password },
			asResponse: true,
		});
		expect(res.status).toBe(200);

		const setCookies = extractSetCookies(res);
		const tokenEntries = setCookies.filter((entry) =>
			entry.startsWith("better-auth.session_token="),
		);
		for (const entry of tokenEntries) {
			expect(getCookieValue(entry)).toBe("");
		}
	});

	it("replaying any cookies captured from the response cannot authenticate", async () => {
		const res = await auth.api.signInEmail({
			body: { email: testUser.email, password: testUser.password },
			asResponse: true,
		});
		const setCookies = extractSetCookies(res);
		const replay = buildCookieHeader(setCookies, [
			"better-auth.session_token",
			"better-auth.session_data",
		]);

		const session = await auth.api.getSession({ headers: replay });
		expect(session).toBeNull();
	});
});

describe("two-factor security: chunked session_data is fully scrubbed on 2FA-required sign-in", async () => {
	// Forces session_data to be chunked by inflating the user payload past 4KB,
	// verifies that the credential sign-in path actually emits chunks, then
	// asserts the 2FA-required sign-in response exposes no valid chunk value.
	// This pins the chunk-prefix branch of removeSetCookieEntries — without it,
	// a future tightening of the match (e.g. exact-only) could silently leak
	// `session_data.N` chunks while passing the non-chunked tests.
	const filler = "x".repeat(2200);
	const { auth, signInWithTestUser, testUser, db } = await getTestInstance({
		secret: DEFAULT_SECRET,
		user: {
			additionalFields: {
				blob1: { type: "string", defaultValue: "" },
				blob2: { type: "string", defaultValue: "" },
			},
		},
		session: { cookieCache: { enabled: true } },
		plugins: [twoFactor()],
	});

	const { headers } = await signInWithTestUser();
	const dbUser = await db.findOne<User>({
		model: "user",
		where: [{ field: "email", value: testUser.email }],
	});
	const userId = dbUser?.id as string;
	await db.update({
		model: "user",
		where: [{ field: "id", value: userId }],
		update: { blob1: filler, blob2: filler },
	});

	const chunkProbeRes = await auth.api.signInEmail({
		body: { email: testUser.email, password: testUser.password },
		asResponse: true,
	});
	const chunkProbeEntries = extractSetCookies(chunkProbeRes).filter((entry) =>
		entry.startsWith("better-auth.session_data."),
	);

	const enrollment = await auth.api.enableTwoFactor({
		body: { password: testUser.password },
		headers,
	});
	if (enrollment.method !== "totp") {
		throw new Error("expected totp enrollment");
	}
	const row = await db.findOne<TwoFactorTable>({
		model: "twoFactor",
		where: [{ field: "userId", value: userId }],
	});
	const secret = await symmetricDecrypt({
		key: DEFAULT_SECRET,
		data: row!.secret,
	});
	const totpCode = await createOTP(secret).totp();
	await auth.api.verifyTOTP({ body: { code: totpCode }, headers });

	it("test setup exercises chunked session_data cookies", () => {
		expect(chunkProbeRes.status).toBe(200);
		expect(chunkProbeEntries.length).toBeGreaterThan(0);
	});

	it("no session_data.N chunk leaks a non-empty value and replay cannot authenticate", async () => {
		const res = await auth.api.signInEmail({
			body: { email: testUser.email, password: testUser.password },
			asResponse: true,
		});
		expect(res.status).toBe(200);

		const setCookies = extractSetCookies(res);

		// Pre-fix, the credential handler emits `session_data.0=<valid>` and
		// `session_data.1=<valid>` (the chunking debug log fires above) and the
		// after-hook only appends an expiring single `session_data=`. The scrub
		// in `removeSetCookieEntries` (chunk-prefix branch) deletes every
		// `session_data.*` entry, so either none survive OR any that do must
		// carry an empty value.
		const chunkEntries = setCookies.filter((entry) =>
			entry.startsWith("better-auth.session_data."),
		);
		for (const entry of chunkEntries) {
			expect(getCookieValue(entry)).toBe("");
		}

		const tokenEntries = setCookies.filter((entry) =>
			entry.startsWith("better-auth.session_token="),
		);
		for (const entry of tokenEntries) {
			expect(getCookieValue(entry)).toBe("");
		}

		// Replay covers the regression case too: even if the chunk-prefix scrub
		// silently regresses and `session_data.N=<valid>` leaks back, the cookie
		// cache would reconstruct a valid session here and this assertion fails.
		const replay = new Headers();
		const parts: string[] = [];
		for (const entry of setCookies) {
			if (
				!entry.startsWith("better-auth.session_token=") &&
				!entry.startsWith("better-auth.session_data=") &&
				!entry.startsWith("better-auth.session_data.")
			) {
				continue;
			}
			const firstSegment = entry.split(";")[0] ?? "";
			const eq = firstSegment.indexOf("=");
			if (eq <= 0) continue;
			const value = firstSegment.slice(eq + 1);
			if (value.length === 0) continue;
			parts.push(firstSegment);
		}
		replay.set("cookie", parts.join("; "));

		const session = await auth.api.getSession({ headers: replay });
		expect(session).toBeNull();
	});
});

/**
 * The signed `two_factor` challenge is a single-use, time-bounded credential:
 * exactly one verification may complete it, and only within its expiry window.
 *
 * Two failures violated that contract. The challenge row was loaded with a
 * plain existence check that never inspected `expiresAt`, so a replayed cookie
 * pointing at an expired-but-not-yet-cleaned row could still mint a session
 * once a valid TOTP was supplied. And the row was deleted only after the
 * session was created, so two concurrent verifications of the same cookie
 * could both pass the stale read and each mint a separate session. Consuming
 * the row atomically before session creation closes both: expiry is rejected
 * because the consume returns null for expired rows, and the race is rejected
 * because only the first caller wins the delete-and-return.
 */
describe("two-factor security: 2FA challenge is single-use and expiry-bounded", async () => {
	const { auth, signInWithTestUser, testUser, db } = await getTestInstance({
		secret: DEFAULT_SECRET,
		plugins: [twoFactor()],
	});

	const { headers } = await signInWithTestUser();
	const dbUser = await db.findOne<User>({
		model: "user",
		where: [{ field: "email", value: testUser.email }],
	});
	const userId = dbUser?.id as string;

	const enrollment = await auth.api.enableTwoFactor({
		body: { password: testUser.password },
		headers,
	});
	if (enrollment.method !== "totp") {
		throw new Error("expected totp enrollment");
	}
	const row = await db.findOne<TwoFactorTable>({
		model: "twoFactor",
		where: [{ field: "userId", value: userId }],
	});
	const secret = await symmetricDecrypt({
		key: DEFAULT_SECRET,
		data: row!.secret,
	});
	const enrollCode = await createOTP(secret).totp();
	await auth.api.verifyTOTP({ body: { code: enrollCode }, headers });
	const verified = await db.findOne<UserWithTwoFactor>({
		model: "user",
		where: [{ field: "id", value: userId }],
	});
	if (!verified?.twoFactorEnabled) {
		throw new Error("failed to enable 2FA for test user");
	}

	async function startChallenge(): Promise<Headers> {
		const res = await auth.api.signInEmail({
			body: { email: testUser.email, password: testUser.password },
			asResponse: true,
		});
		expect(res.status).toBe(200);
		return convertSetCookieToCookie(res.headers);
	}

	function countSessions(): Promise<Session[]> {
		return db.findMany<Session>({
			model: "session",
			where: [{ field: "userId", value: userId }],
		});
	}

	it("rejects an expired two-factor sign-in challenge even with a valid TOTP", async () => {
		const challengeHeaders = await startChallenge();
		const challengeRow = await db.findOne<Verification>({
			model: "verification",
			where: [{ field: "value", value: userId }],
		});
		expect(challengeRow).not.toBeNull();

		// Force the challenge past its expiry while leaving the row present, so
		// the only thing standing between a stale cookie and a session is the
		// server-side expiry gate.
		await db.update({
			model: "verification",
			where: [{ field: "id", value: challengeRow!.id }],
			update: { expiresAt: new Date(Date.now() - 60 * 1000) },
		});

		const sessionsBefore = await countSessions();
		// The enrollment verify above already consumed the current step's code
		// (TOTPs are single-use), so mint the next step's — still inside the ±1
		// acceptance window.
		const freshCode = await createOTP(secret).hotp(
			Math.floor(Date.now() / 30_000) + 1,
		);
		const res = await auth.api.verifyTOTP({
			body: { code: freshCode },
			headers: challengeHeaders,
			asResponse: true,
		});

		expect(res.status).toBe(401);
		const json = (await res.json()) as { message: string };
		expect(json.message).toBe(
			TWO_FACTOR_ERROR_CODES.INVALID_TWO_FACTOR_COOKIE.message,
		);

		const setCookies = res.headers.getSetCookie();
		const tokenEntries = setCookies.filter((entry) =>
			entry.startsWith("better-auth.session_token="),
		);
		for (const entry of tokenEntries) {
			const firstSegment = entry.split(";")[0] ?? "";
			const eq = firstSegment.indexOf("=");
			expect(eq > 0 ? firstSegment.slice(eq + 1) : "").toBe("");
		}

		const sessionsAfter = await countSessions();
		expect(sessionsAfter.length).toBe(sessionsBefore.length);
	});

	it("two concurrent verifications of the same challenge yield exactly one session", async () => {
		// Enrollment and the expired-challenge test each consumed a step (TOTPs
		// are single-use — a valid code burns its step even when the challenge
		// later fails), so advance the clock two steps to reach an unconsumed
		// step before minting a code.
		vi.useFakeTimers({ toFake: ["Date"] });
		vi.setSystemTime(Date.now() + 61_000);
		try {
			const challengeHeaders = await startChallenge();
			const sessionsBefore = await countSessions();
			const code = await createOTP(secret).totp();

			const [first, second] = await Promise.all([
				auth.api.verifyTOTP({
					body: { code },
					headers: challengeHeaders,
					asResponse: true,
				}),
				auth.api.verifyTOTP({
					body: { code },
					headers: challengeHeaders,
					asResponse: true,
				}),
			]);

			const statuses = [first.status, second.status].sort();
			expect(statuses).toEqual([200, 401]);

			const sessionsAfter = await countSessions();
			expect(sessionsAfter.length).toBe(sessionsBefore.length + 1);
		} finally {
			vi.useRealTimers();
		}
	});
});

/**
 * The two-factor OTP attempt counter must survive a burst of concurrent
 * submissions. The counter used to be tracked with a read-counter then
 * write-counter pair, so concurrent wrong guesses could all read the same
 * value before any write landed and exhaust far more than `allowedAttempts`
 * guesses against a single code. Consuming the OTP row atomically before the
 * code comparison makes the row itself the race gate: every wrong guess burns
 * the row and re-arms it with the next counter, so only one submission can act
 * on each counter value and the budget cannot be raced past. The same gate
 * guarantees a single correct code mints at most one session.
 */
describe("two-factor security: OTP attempts are atomic under concurrency", async () => {
	const allowedAttempts = 3;
	let currentOTP = "";

	// A secondary storage whose normal reads of the OTP row are deliberately
	// slow while `getAndDelete` is immediate. Without an atomic consume gate,
	// every concurrent verification could finish a slow read of the same
	// counter before any write lands. The fix consumes the row through the
	// required storage primitive, so each attempt observes a distinct counter.
	const store = new Map<string, { value: string; expiresAt: number }>();
	const isOtpRow = (key: string) => key.includes("2fa-otp");
	const secondaryStorage: SecondaryStorage = {
		async get(key: string) {
			if (isOtpRow(key)) {
				await new Promise((resolve) => setTimeout(resolve, 25));
			}
			const entry = store.get(key);
			if (!entry) return null;
			if (entry.expiresAt < Date.now()) {
				store.delete(key);
				return null;
			}
			return entry.value;
		},
		async getAndDelete(key: string) {
			const entry = store.get(key);
			store.delete(key);
			if (!entry || entry.expiresAt < Date.now()) {
				return null;
			}
			return entry.value;
		},
		async increment(key: string, ttl: number) {
			const entry = store.get(key);
			const count = Number(entry?.value ?? 0) + 1;
			store.set(key, {
				value: String(count),
				expiresAt: Date.now() + ttl * 1000,
			});
			return count;
		},
		async set(key: string, value: string, ttl?: number) {
			store.set(key, {
				value,
				expiresAt: Date.now() + (ttl ?? 60) * 1000,
			});
		},
		async delete(key: string) {
			store.delete(key);
		},
	};

	const { auth, signInWithTestUser, testUser, db } = await getTestInstance({
		secret: DEFAULT_SECRET,
		secondaryStorage,
		plugins: [
			twoFactor({
				otpOptions: {
					allowedAttempts,
					sendOTP({ otp }) {
						currentOTP = otp;
					},
				},
			}),
		],
	});

	const { headers } = await signInWithTestUser();
	const dbUser = await db.findOne<User>({
		model: "user",
		where: [{ field: "email", value: testUser.email }],
	});
	const userId = dbUser?.id as string;

	const enrollment = await auth.api.enableTwoFactor({
		body: { password: testUser.password },
		headers,
	});
	if (enrollment.method !== "totp") {
		throw new Error("expected totp enrollment");
	}
	const row = await db.findOne<TwoFactorTable>({
		model: "twoFactor",
		where: [{ field: "userId", value: userId }],
	});
	const secret = await symmetricDecrypt({
		key: DEFAULT_SECRET,
		data: row!.secret,
	});
	const enrollCode = await createOTP(secret).totp();
	await auth.api.verifyTOTP({ body: { code: enrollCode }, headers });
	const verified = await db.findOne<UserWithTwoFactor>({
		model: "user",
		where: [{ field: "id", value: userId }],
	});
	if (!verified?.twoFactorEnabled) {
		throw new Error("failed to enable 2FA for test user");
	}

	async function startChallengeWithOtp(): Promise<Headers> {
		const signIn = await auth.api.signInEmail({
			body: { email: testUser.email, password: testUser.password },
			asResponse: true,
		});
		expect(signIn.status).toBe(200);
		const challengeHeaders = convertSetCookieToCookie(signIn.headers);
		await auth.api.sendTwoFactorOTP({ headers: challengeHeaders });
		return challengeHeaders;
	}

	function verifyOtp(
		challengeHeaders: Headers,
		code: string,
	): Promise<Response> {
		return auth.api.verifyTwoFactorOTP({
			body: { code },
			headers: challengeHeaders,
			asResponse: true,
		});
	}

	it("counts wrong guesses up to the limit then locks out", async () => {
		const challengeHeaders = await startChallengeWithOtp();

		for (let i = 0; i < allowedAttempts; i++) {
			const res = await verifyOtp(challengeHeaders, "000000");
			expect(res.status).toBe(401);
			const json = (await res.json()) as { message: string };
			expect(json.message).toBe(TWO_FACTOR_ERROR_CODES.INVALID_CODE.message);
		}

		// The budget is spent: even the correct code is locked out.
		const locked = await verifyOtp(challengeHeaders, currentOTP);
		expect(locked.status).toBe(400);
		const lockedJson = (await locked.json()) as { message: string };
		expect(lockedJson.message).toBe(
			TWO_FACTOR_ERROR_CODES.TOO_MANY_ATTEMPTS_REQUEST_NEW_CODE.message,
		);
	});

	it("a concurrent burst of wrong guesses cannot exceed the attempt budget", async () => {
		const challengeHeaders = await startChallengeWithOtp();
		const burst = allowedAttempts * 4;

		const results = await Promise.all(
			Array.from({ length: burst }, () =>
				verifyOtp(challengeHeaders, "111111"),
			),
		);
		const bodies = await Promise.all(
			results.map((res) => res.json() as Promise<{ message?: string }>),
		);

		const invalidCount = bodies.filter(
			(body) => body.message === TWO_FACTOR_ERROR_CODES.INVALID_CODE.message,
		).length;

		// Each wrong guess consumes exactly one counter slot, so no matter how
		// many race in at once the number of accepted guesses is capped by the
		// budget. The remaining racers lose the consume and are rejected.
		expect(invalidCount).toBeLessThanOrEqual(allowedAttempts);
	});

	it("concurrent correct codes mint at most one session", async () => {
		const challengeHeaders = await startChallengeWithOtp();

		const results = await Promise.all([
			verifyOtp(challengeHeaders, currentOTP),
			verifyOtp(challengeHeaders, currentOTP),
			verifyOtp(challengeHeaders, currentOTP),
		]);
		// Only the racer that wins the OTP consume may complete; the others lose
		// the consume and never reach session creation, so at most one 200.
		const successCount = results.filter((res) => res.status === 200).length;
		expect(successCount).toBeLessThanOrEqual(1);
	});
});

/**
 * Regression coverage for TOTP one-time use (RFC 6238 §5.2 / OWASP ASVS 5.0
 * §6.5.1). Verification used to be stateless: a code that passed once stayed
 * valid for the rest of its ~90s acceptance window — the step-up
 * (active-session) path accepted it repeatedly, and the sign-in path accepted
 * it again under a fresh challenge, because only the challenge row was
 * consumed. The twoFactor row now records the last consumed time step and the
 * verify endpoint claims the matched step with an atomic guarded write before
 * issuing a session, so a code works exactly once — sequentially or under
 * concurrency. Each test enrolls its own instance so the persisted
 * `lastUsedStep` cannot leak between cases.
 *
 * @see https://github.com/better-auth/better-auth/issues/10387
 */
describe("two-factor security: TOTP codes are single-use (RFC 6238 §5.2)", () => {
	async function setupTotpUser() {
		const { auth, signInWithTestUser, testUser, db } = await getTestInstance({
			secret: DEFAULT_SECRET,
			plugins: [twoFactor({ skipVerificationOnEnable: true })],
		});
		const { headers } = await signInWithTestUser();
		const enableRes = await auth.api.enableTwoFactor({
			body: { password: testUser.password },
			headers,
			asResponse: true,
		});
		// skipVerificationOnEnable activates 2FA immediately and rotates the
		// session, so use the cookies from the enable response going forward.
		const sessionHeaders = convertSetCookieToCookie(enableRes.headers);
		const dbUser = await db.findOne<User>({
			model: "user",
			where: [{ field: "email", value: testUser.email }],
		});
		const userId = dbUser?.id as string;
		const row = await db.findOne<TwoFactorTable>({
			model: "twoFactor",
			where: [{ field: "userId", value: userId }],
		});
		const secret = await symmetricDecrypt({
			key: DEFAULT_SECRET,
			data: row!.secret,
		});
		return { auth, secret, sessionHeaders, testUser };
	}

	async function freshChallenge(
		auth: Awaited<ReturnType<typeof setupTotpUser>>["auth"],
		testUser: Awaited<ReturnType<typeof setupTotpUser>>["testUser"],
	): Promise<Headers> {
		const res = await auth.api.signInEmail({
			body: { email: testUser.email, password: testUser.password },
			asResponse: true,
		});
		expect(res.status).toBe(200);
		return convertSetCookieToCookie(res.headers);
	}

	it("rejects a code reused on the step-up (active session) path", async () => {
		const { auth, secret, sessionHeaders } = await setupTotpUser();
		const code = await createOTP(secret).totp();

		const first = await auth.api.verifyTOTP({
			body: { code },
			headers: sessionHeaders,
			asResponse: true,
		});
		expect(first.status).toBe(200);

		const replay = await auth.api.verifyTOTP({
			body: { code },
			headers: sessionHeaders,
			asResponse: true,
		});
		expect(replay.status).toBe(401);
		const json = (await replay.json()) as { message: string };
		expect(json.message).toBe(TWO_FACTOR_ERROR_CODES.INVALID_CODE.message);
	});

	it("accepts a step-up code exactly once across repeated attempts", async () => {
		const { auth, secret, sessionHeaders } = await setupTotpUser();
		const code = await createOTP(secret).totp();

		// The reported repro accepted the same code 3/3 times on the step-up
		// path; it must now succeed exactly once.
		const results = await Promise.all(
			[0, 1, 2].map(() =>
				auth.api.verifyTOTP({
					body: { code },
					headers: sessionHeaders,
					asResponse: true,
				}),
			),
		);
		expect(results.filter((res) => res.status === 200)).toHaveLength(1);
	});

	it("rejects a code reused across fresh sign-in challenges", async () => {
		const { auth, secret, testUser } = await setupTotpUser();
		const code = await createOTP(secret).totp();

		const first = await auth.api.verifyTOTP({
			body: { code },
			headers: await freshChallenge(auth, testUser),
			asResponse: true,
		});
		expect(first.status).toBe(200);

		// A new challenge used to re-accept the same code because only the
		// challenge row was consumed; the consumed step now rejects the replay.
		const replay = await auth.api.verifyTOTP({
			body: { code },
			headers: await freshChallenge(auth, testUser),
			asResponse: true,
		});
		expect(replay.status).toBe(401);
		const json = (await replay.json()) as { message: string };
		expect(json.message).toBe(TWO_FACTOR_ERROR_CODES.INVALID_CODE.message);
	});

	it("concurrent sign-in challenges with the same code mint at most one session", async () => {
		const { auth, secret, testUser } = await setupTotpUser();
		const code = await createOTP(secret).totp();

		const [challengeA, challengeB] = await Promise.all([
			freshChallenge(auth, testUser),
			freshChallenge(auth, testUser),
		]);
		const results = await Promise.all([
			auth.api.verifyTOTP({
				body: { code },
				headers: challengeA,
				asResponse: true,
			}),
			auth.api.verifyTOTP({
				body: { code },
				headers: challengeB,
				asResponse: true,
			}),
		]);
		expect(results.filter((res) => res.status === 200)).toHaveLength(1);
	});

	it("still accepts a code from the next step inside the window", async () => {
		const { auth, secret, sessionHeaders } = await setupTotpUser();

		// Burn the current step, then prove the guard is not over-blocking: a
		// code for the following step is still within the ±1 acceptance window
		// and must verify.
		const current = await createOTP(secret).totp();
		const first = await auth.api.verifyTOTP({
			body: { code: current },
			headers: sessionHeaders,
			asResponse: true,
		});
		expect(first.status).toBe(200);

		const nextStepCode = await createOTP(secret).hotp(
			Math.floor(Date.now() / 30_000) + 1,
		);
		const res = await auth.api.verifyTOTP({
			body: { code: nextStepCode },
			headers: sessionHeaders,
			asResponse: true,
		});
		expect(res.status).toBe(200);
	});
});
