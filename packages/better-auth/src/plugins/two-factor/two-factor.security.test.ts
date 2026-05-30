import type { BetterAuthPlugin } from "@better-auth/core";
import { createAuthMiddleware } from "@better-auth/core/api";
import { createOTP } from "@better-auth/utils/otp";
import { describe, expect, it } from "vitest";
import { symmetricDecrypt } from "../../crypto";
import { getTestInstance } from "../../test-utils/test-instance";
import type { User } from "../../types";
import { DEFAULT_SECRET } from "../../utils/constants";
import { phoneNumber } from "../phone-number";
import { username } from "../username";
import { twoFactor } from ".";
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
	if (!enrollment.totpURI) {
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
	if (!enrollment.totpURI) {
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
	if (!enrollment.totpURI) {
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
