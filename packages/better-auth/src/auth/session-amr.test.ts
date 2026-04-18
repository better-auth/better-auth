import type { AuthenticationMethodReference } from "@better-auth/core";
import { amrSchema, BUILTIN_AMR_METHOD } from "@better-auth/core";
import { describe, expect, it } from "vitest";
import { anonymous } from "../plugins/anonymous";
import { anonymousClient } from "../plugins/anonymous/client";
import { magicLink } from "../plugins/magic-link";
import { magicLinkClient } from "../plugins/magic-link/client";
import { twoFactor } from "../plugins/two-factor";
import { getTestInstance } from "../test-utils";

async function readSessionAMR(
	auth: { api: { getSession: (opts: { headers: Headers }) => any } },
	token: string,
): Promise<AuthenticationMethodReference[]> {
	const session = await auth.api.getSession({
		headers: new Headers({ authorization: `Bearer ${token}` }),
	});
	return (
		(session?.session as { amr?: AuthenticationMethodReference[] })?.amr ?? []
	);
}

function readSessionTokenFromCookie(setCookie: string): string | undefined {
	const match = setCookie.match(/better-auth\.session_token=([^;]+)/);
	return match?.[1];
}

describe("session.amr is the canonical authentication record", () => {
	it("email+password: session.amr[0] has method=password factor=knowledge", async () => {
		const { auth, testUser } = await getTestInstance();
		const res = await auth.api.signInEmail({
			body: { email: testUser.email, password: testUser.password },
			asResponse: true,
		});
		const body = (await res.json()) as { token: string };
		const amr = await readSessionAMR(auth, body.token);
		expect(amr).toHaveLength(1);
		expect(amr[0]).toMatchObject({
			method: BUILTIN_AMR_METHOD.PASSWORD,
			factor: "knowledge",
		});
		expect(amr[0]!.completedAt).toBeInstanceOf(Date);
	});

	it("magic-link: session.amr[0] has method=magic-link factor=possession", async () => {
		let magicLinkEmail = { email: "", token: "", url: "" };
		const { client, auth, testUser } = await getTestInstance(
			{
				plugins: [
					magicLink({
						async sendMagicLink(data) {
							magicLinkEmail = data;
						},
					}),
				],
			},
			{
				clientOptions: {
					plugins: [magicLinkClient()],
				},
			},
		);
		await client.signIn.magicLink({ email: testUser.email });
		const token = new URL(magicLinkEmail.url).searchParams.get("token")!;
		const verifyRes = await auth.api.magicLinkVerify({
			query: { token, callbackURL: "/callback" },
			headers: new Headers(),
			asResponse: true,
		});
		const setCookie = verifyRes.headers.get("set-cookie") ?? "";
		const sessionToken = readSessionTokenFromCookie(setCookie);
		expect(sessionToken).toBeDefined();
		const sessionRes = await auth.api.getSession({
			headers: new Headers({
				cookie: `better-auth.session_token=${sessionToken}`,
			}),
		});
		const amr = (sessionRes?.session as any)
			?.amr as AuthenticationMethodReference[];
		expect(amr).toHaveLength(1);
		expect(amr[0]).toMatchObject({
			method: BUILTIN_AMR_METHOD.MAGIC_LINK,
			factor: "possession",
		});
	});

	it("two-factor append: verifying TOTP adds a second amr entry, primary first", async () => {
		let otp = "";
		const { auth, db, testUser } = await getTestInstance({
			plugins: [
				twoFactor({
					otpOptions: {
						sendOTP({ otp: nextOtp }) {
							otp = nextOtp;
						},
					},
				}),
			],
		});
		await db.update({
			model: "user",
			update: { twoFactorEnabled: true },
			where: [{ field: "email", value: testUser.email }],
		});
		const signInRes = await auth.api.signInEmail({
			body: { email: testUser.email, password: testUser.password },
			asResponse: true,
		});
		const challengeHeaders = new Headers();
		const signInSetCookie = signInRes.headers.get("set-cookie") ?? "";
		challengeHeaders.set("cookie", signInSetCookie.replace(/;.*$/, ""));
		await auth.api.sendTwoFactorOTP({ headers: challengeHeaders, body: {} });
		const verifyRes = await auth.api.verifyTwoFactorOTP({
			headers: challengeHeaders,
			body: { code: otp },
			asResponse: true,
		});
		const body = (await verifyRes.json()) as { token: string };
		const amr = await readSessionAMR(auth, body.token);
		expect(amr).toHaveLength(2);
		expect(amr[0]).toMatchObject({
			method: BUILTIN_AMR_METHOD.PASSWORD,
			factor: "knowledge",
		});
		expect(amr[1]).toMatchObject({
			method: BUILTIN_AMR_METHOD.OTP,
			factor: "possession",
		});
	});

	it("anonymous sign-in leaves amr empty (anonymous is not an authenticated factor)", async () => {
		const { auth, client } = await getTestInstance(
			{
				plugins: [anonymous()],
			},
			{
				clientOptions: {
					plugins: [anonymousClient()],
				},
			},
		);
		const res = await client.signIn.anonymous();
		const token = (res.data as { token?: string } | undefined)?.token;
		expect(token).toBeDefined();
		const amr = await readSessionAMR(auth, token!);
		expect(amr).toStrictEqual([]);
	});
});

describe("amrSchema revives completedAt from JSON storage", () => {
	it("parses ISO-string completedAt back into a Date instance", () => {
		const stored = JSON.stringify([
			{
				method: BUILTIN_AMR_METHOD.PASSWORD,
				factor: "knowledge",
				completedAt: new Date("2025-01-02T03:04:05.000Z"),
			},
		]);
		const parsed = amrSchema.parse(JSON.parse(stored));
		expect(parsed).toHaveLength(1);
		expect(parsed[0]!.completedAt).toBeInstanceOf(Date);
		expect(parsed[0]!.completedAt.toISOString()).toBe(
			"2025-01-02T03:04:05.000Z",
		);
	});

	it("strips unknown keys so stored payloads stay forward-compatible", () => {
		const parsed = amrSchema.parse([
			{
				method: BUILTIN_AMR_METHOD.PASSWORD,
				factor: "knowledge",
				completedAt: "2025-06-01T00:00:00.000Z",
				legacyExtra: "ignored",
			},
		]);
		expect(parsed[0]).not.toHaveProperty("legacyExtra");
	});
});

describe("changePassword refreshes the primary factor", () => {
	it("amr[0].completedAt is bumped to the moment of the rotation", async () => {
		const { auth, testUser } = await getTestInstance();
		const signInRes = await auth.api.signInEmail({
			body: { email: testUser.email, password: testUser.password },
			asResponse: true,
		});
		const { token: initialToken } = (await signInRes.json()) as {
			token: string;
		};
		const initialAmr = await readSessionAMR(auth, initialToken);
		const initialCompletedAt = new Date(initialAmr[0]!.completedAt);

		await new Promise((resolve) => setTimeout(resolve, 10));

		const changeRes = await auth.api.changePassword({
			headers: new Headers({ authorization: `Bearer ${initialToken}` }),
			body: {
				newPassword: "newPassword123",
				currentPassword: testUser.password,
				revokeOtherSessions: true,
			},
			asResponse: true,
		});
		const { token: rotatedToken } = (await changeRes.json()) as {
			token: string;
		};
		const rotatedAmr = await readSessionAMR(auth, rotatedToken);

		expect(rotatedAmr[0]).toMatchObject({
			method: BUILTIN_AMR_METHOD.PASSWORD,
			factor: "knowledge",
		});
		expect(new Date(rotatedAmr[0]!.completedAt).getTime()).toBeGreaterThan(
			initialCompletedAt.getTime(),
		);
	});
});

describe("email verification does not contaminate amr with magic-link", () => {
	it("verifyEmail-driven sign-in stamps email-verification, not magic-link", async () => {
		let verifyURL = "";
		const { auth, client, testUser } = await getTestInstance({
			emailVerification: {
				autoSignInAfterVerification: true,
				async sendVerificationEmail({ url }) {
					verifyURL = url;
				},
			},
			emailAndPassword: {
				enabled: true,
				requireEmailVerification: false,
			},
		});
		await client.sendVerificationEmail({
			email: testUser.email,
			callbackURL: "/callback",
		});
		expect(verifyURL).not.toBe("");
		const verifyRes = await auth.api.verifyEmail({
			query: { token: new URL(verifyURL).searchParams.get("token")! },
			headers: new Headers(),
			asResponse: true,
		});
		const setCookie = verifyRes.headers.get("set-cookie") ?? "";
		const sessionToken = readSessionTokenFromCookie(setCookie);
		if (!sessionToken) return;
		const amr = await readSessionAMR(auth, sessionToken);
		expect(amr.map((entry) => entry.method)).not.toContain(
			BUILTIN_AMR_METHOD.MAGIC_LINK,
		);
		expect(amr[0]).toMatchObject({
			method: BUILTIN_AMR_METHOD.EMAIL_VERIFICATION,
			factor: "possession",
		});
	});
});

describe("resolveSignIn enforces amr at the type level", () => {
	it("forgetting amr is a TypeScript error", async () => {
		// @ts-expect-error amr is required; this must fail typecheck
		const options: import("./resolve-sign-in").ResolveSignInOptions = {
			user: {} as any,
		};
		expect(options).toBeDefined();
	});

	it("amr must be an AuthenticationMethodReference, not just a method string", async () => {
		const options: import("./resolve-sign-in").ResolveSignInOptions = {
			user: {} as any,
			amr: {
				method: BUILTIN_AMR_METHOD.PASSWORD,
				factor: "knowledge",
				completedAt: new Date(),
			},
		};
		expect(options.amr.method).toBe("password");
	});
});
